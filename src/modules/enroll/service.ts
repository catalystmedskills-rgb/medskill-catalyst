import { db } from "@/src/lib/db";
import {
  LinkStatus,
  ActivityType,
  EnrollmentStatus,
  DocKind,
  PaymentStatus,
  PaymentProvider,
  CommChannel,
  CommStatus,
  BatchStatus,
  LeadSource,
  LeadStatus,
} from "@/src/generated/prisma/enums";
import type { Prisma } from "@/src/generated/prisma/client";
import { createRazorpayOrder, publicKeyId } from "@/src/lib/razorpay";
import { createInvoice, findInvoiceByEnrollment, money } from "@/src/lib/invoices";
import { enrollmentConfirmationEmail, sendEmail } from "@/src/lib/email";
import type { EnrollmentApplication } from "./schemas";

export class EnrollError extends Error {}

const WHATSAPP_URL = "https://wa.me/918800665154";

/**
 * The final, GST-inclusive amount the customer pays, in paise. This is the
 * price shown on the enrollment page (EnrollmentLink.price_paise, copied onto
 * the Enrollment). Kept in one place so it's the single trusted source for both
 * the Razorpay order and the invoice total.
 *
 * NOTE: discount_paise is treated as informational "you saved this" context,
 * not subtracted again here — price_paise is already the payable figure.
 */
export function amountPayablePaise(e: { price_paise: number }): number {
  return e.price_paise;
}

/**
 * Loads and advances an enrollment link for the public /enroll/[token] page.
 * SENT → OPENED on first view; SENT/OPENED past expiry → EXPIRED.
 */
export async function getEnrollmentLink(token: string) {
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(token)) return null;

  const link = await db.enrollmentLink.findUnique({
    where: { token },
    include: {
      lead: { select: { id: true, full_name: true, email: true, mobile: true } },
      batch: { include: { course: true } },
      enrollment: { select: { id: true, status: true } },
    },
  });
  if (!link) return null;

  const open = link.status === LinkStatus.SENT || link.status === LinkStatus.OPENED;
  if (open && link.expires_at < new Date()) {
    await db.enrollmentLink.update({
      where: { id: link.id },
      data: { status: LinkStatus.EXPIRED },
    });
    return { ...link, status: LinkStatus.EXPIRED };
  }

  if (link.status === LinkStatus.SENT) {
    await db.enrollmentLink.update({
      where: { id: link.id },
      data: { status: LinkStatus.OPENED },
    });
    await db.activity.create({
      data: {
        type: ActivityType.SYSTEM,
        body: `Enrollment link opened (${link.batch.course.name} · ${link.batch.name})`,
        lead_id: link.lead_id,
      },
    });
    return { ...link, status: LinkStatus.OPENED };
  }

  return link;
}

/**
 * Funnel step 7: student completes the full application. Creates Student +
 * Enrollment (PAYMENT_PENDING) atomically, records uploaded documents, and marks
 * the link COMPLETED. Idempotent per token.
 */
export async function completeEnrollment(token: string, form: EnrollmentApplication) {
  const fullName = `${form.first_name} ${form.last_name}`.trim();
  const email = form.email.toLowerCase();

  // A short human summary for the Student.qualification column.
  const qualification =
    form.is_student && form.degree
      ? [form.degree, form.course].filter(Boolean).join(" · ")
      : form.is_working_professional && form.designation
        ? [form.designation, form.company_name].filter(Boolean).join(" @ ")
        : null;

  // Everything the Student table has no dedicated column for lives here.
  const profile = {
    gender: form.gender,
    address: form.address,
    country: form.country,
    zip_code: form.zip_code,
    nationality: form.nationality,
    college: form.college,
    is_student: form.is_student,
    is_working_professional: form.is_working_professional,
    academic: form.is_student
      ? {
          university: form.university,
          college: form.college || null,
          degree: form.degree,
          course: form.course,
          year_of_study: form.year_of_study,
          graduation_year: form.graduation_year,
        }
      : null,
    professional: form.is_working_professional
      ? {
          company_name: form.company_name,
          designation: form.designation,
          experience: form.experience || null,
        }
      : null,
    linkedin: form.linkedin || null,
    medical_registration_number: form.medical_registration_number || null,
    resume: form.resume ?? null,
    consent: {
      accepted: form.consent,
      accepted_at: new Date().toISOString(),
    },
  };

  return db.$transaction(async (tx) => {
    const link = await tx.enrollmentLink.findUnique({
      where: { token },
      include: { batch: { include: { course: true } } },
    });
    if (!link) throw new EnrollError("This enrollment link is not valid.");
    if (link.status === LinkStatus.COMPLETED && link.enrollment_id) {
      return { enrollmentId: link.enrollment_id, alreadyCompleted: true };
    }
    if (link.status === LinkStatus.REVOKED) {
      throw new EnrollError("This enrollment link has been withdrawn. Please contact us.");
    }
    if (link.expires_at < new Date()) {
      throw new EnrollError("This enrollment link has expired. Please ask us for a fresh one.");
    }

    const student = await tx.student.upsert({
      where: { email },
      create: {
        full_name: fullName,
        email,
        phone: form.phone,
        whatsapp: form.whatsapp || form.phone,
        city: form.city,
        state: form.state,
        qualification,
        extra: profile,
      },
      update: {
        full_name: fullName,
        phone: form.phone,
        whatsapp: form.whatsapp || form.phone,
        city: form.city,
        state: form.state,
        qualification,
        extra: profile,
      },
    });

    const enrollment = await tx.enrollment.upsert({
      where: {
        student_id_batch_id: { student_id: student.id, batch_id: link.batch_id },
      },
      create: {
        student_id: student.id,
        batch_id: link.batch_id,
        status: EnrollmentStatus.PAYMENT_PENDING,
        price_paise: link.price_paise,
        discount_paise: link.discount_paise,
        source_lead_id: link.lead_id,
      },
      update: {},
    });

    // Register the résumé as a Document row (owner = the student) — if provided.
    if (form.resume) {
      await tx.document.create({
        data: {
          owner_type: "student",
          owner_id: student.id,
          kind: DocKind.OTHER,
          r2_key: form.resume.key,
          mime: form.resume.mime,
          size_bytes: form.resume.size,
        },
      });
    }

    await tx.enrollmentLink.update({
      where: { id: link.id },
      data: { status: LinkStatus.COMPLETED, enrollment_id: enrollment.id },
    });

    await tx.lead.update({
      where: { id: link.lead_id },
      data: { converted_student_id: student.id, updated_at: new Date() },
    });

    await tx.activity.create({
      data: {
        type: ActivityType.SYSTEM,
        body: `Enrollment form completed — ${link.batch.course.name} · ${link.batch.name}. Awaiting payment.`,
        lead_id: link.lead_id,
        student_id: student.id,
        enrollment_id: enrollment.id,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "enrollment.form_completed",
        entity_type: "enrollment",
        entity_id: enrollment.id,
        after: { student_id: student.id, batch_id: link.batch_id, price_paise: link.price_paise },
      },
    });

    return { enrollmentId: enrollment.id, alreadyCompleted: false };
  });
}

/** Derives Student.qualification + the extra profile JSON from a form. */
function buildStudentData(form: EnrollmentApplication) {
  const fullName = `${form.first_name} ${form.last_name}`.trim();
  const email = form.email.toLowerCase();
  const qualification =
    form.is_student && form.degree
      ? [form.degree, form.course].filter(Boolean).join(" · ")
      : form.is_working_professional && form.designation
        ? [form.designation, form.company_name].filter(Boolean).join(" @ ")
        : null;
  const profile = {
    gender: form.gender,
    address: form.address,
    country: form.country,
    zip_code: form.zip_code,
    nationality: form.nationality,
    college: form.college,
    is_student: form.is_student,
    is_working_professional: form.is_working_professional,
    academic: form.is_student
      ? {
          university: form.university,
          college: form.college || null,
          degree: form.degree,
          course: form.course,
          year_of_study: form.year_of_study,
          graduation_year: form.graduation_year,
        }
      : null,
    professional: form.is_working_professional
      ? {
          company_name: form.company_name,
          designation: form.designation,
          experience: form.experience || null,
        }
      : null,
    linkedin: form.linkedin || null,
    medical_registration_number: form.medical_registration_number || null,
    resume: form.resume ?? null,
    consent: { accepted: form.consent, accepted_at: new Date().toISOString() },
  };
  return { fullName, email, qualification, profile };
}

/**
 * Public (token-less) enrollment for the /[programme]/enroll pages. Creates
 * Lead + Student + Enrollment (PAYMENT_PENDING) for the course's active batch
 * from the submitted form, with the price taken from the Course record.
 */
export async function completePublicEnrollment(courseSlug: string, form: EnrollmentApplication) {
  const course = await db.course.findUnique({ where: { slug: courseSlug } });
  if (!course || !course.is_active) {
    throw new EnrollError("This programme isn't open for enrollment right now.");
  }

  const batch =
    (await db.batch.findFirst({
      where: { course_id: course.id, status: BatchStatus.ENROLLING },
      orderBy: { created_at: "desc" },
    })) ??
    (await db.batch.findFirst({ where: { course_id: course.id }, orderBy: { created_at: "desc" } }));
  if (!batch) throw new EnrollError("No cohort is currently open for this programme.");

  const { fullName, email, qualification, profile } = buildStudentData(form);

  return db.$transaction(async (tx) => {
    const lead = await tx.lead.upsert({
      where: { email },
      create: {
        full_name: fullName,
        email,
        mobile: form.phone,
        form_type: "public_enroll",
        source: LeadSource.ORGANIC,
        status: LeadStatus.NEW,
      },
      update: { full_name: fullName, mobile: form.phone, updated_at: new Date() },
    });

    const student = await tx.student.upsert({
      where: { email },
      create: {
        full_name: fullName,
        email,
        phone: form.phone,
        whatsapp: form.whatsapp || form.phone,
        city: form.city,
        state: form.state,
        qualification,
        extra: profile,
      },
      update: {
        full_name: fullName,
        phone: form.phone,
        whatsapp: form.whatsapp || form.phone,
        city: form.city,
        state: form.state,
        qualification,
        extra: profile,
      },
    });

    const enrollment = await tx.enrollment.upsert({
      where: { student_id_batch_id: { student_id: student.id, batch_id: batch.id } },
      create: {
        student_id: student.id,
        batch_id: batch.id,
        status: EnrollmentStatus.PAYMENT_PENDING,
        price_paise: course.base_price_paise,
        discount_paise: 0,
        source_lead_id: lead.id,
      },
      update: {},
    });

    // A returning student who already paid for this batch — surface that.
    if (enrollment.status !== EnrollmentStatus.PAYMENT_PENDING) {
      return { enrollmentId: enrollment.id, alreadyCompleted: true };
    }

    if (form.resume) {
      await tx.document.create({
        data: {
          owner_type: "student",
          owner_id: student.id,
          kind: DocKind.OTHER,
          r2_key: form.resume.key,
          mime: form.resume.mime,
          size_bytes: form.resume.size,
        },
      });
    }

    await tx.activity.create({
      data: {
        type: ActivityType.SYSTEM,
        body: `Public enrollment form completed — ${course.name} · ${batch.name}. Awaiting payment.`,
        lead_id: lead.id,
        student_id: student.id,
        enrollment_id: enrollment.id,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "enrollment.public_form_completed",
        entity_type: "enrollment",
        entity_id: enrollment.id,
        after: { student_id: student.id, batch_id: batch.id, price_paise: course.base_price_paise },
      },
    });

    return { enrollmentId: enrollment.id, alreadyCompleted: false };
  });
}

// ─────────────────────────────────────────────────────────────
// Razorpay payment — order creation, capture, and fulfillment
// ─────────────────────────────────────────────────────────────

export type PaymentOrderInfo = {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  enrollmentId: string;
  courseName: string;
  prefill: { name: string; email: string; contact: string };
};

type OrderableEnrollment = {
  id: string;
  status: EnrollmentStatus;
  price_paise: number;
  student: { full_name: string; email: string; phone: string | null } | null;
};

/**
 * Shared order-building core. The amount is always computed from trusted DB
 * records — never from the browser. Idempotent: an existing open order for the
 * same enrollment/amount is reused on retry.
 */
async function buildOrderForEnrollment(
  enrollment: OrderableEnrollment,
  courseName: string,
  fallback: { name: string; email: string; contact: string },
): Promise<PaymentOrderInfo> {
  if (enrollment.status !== EnrollmentStatus.PAYMENT_PENDING) {
    throw new EnrollError("This enrollment is already confirmed.");
  }

  const amountPaise = amountPayablePaise(enrollment);

  const existing = await db.paymentTransaction.findFirst({
    where: {
      enrollment_id: enrollment.id,
      status: PaymentStatus.CREATED,
      provider_order_id: { not: null },
    },
    orderBy: { created_at: "desc" },
  });

  let orderId: string;
  if (existing?.provider_order_id && existing.amount_paise === amountPaise) {
    orderId = existing.provider_order_id;
  } else {
    const order = await createRazorpayOrder({
      amountPaise,
      currency: "INR",
      receipt: `enr_${enrollment.id}`.slice(0, 40),
      notes: { enrollment_id: enrollment.id, course: courseName },
    });
    orderId = order.id;
    await db.paymentTransaction.create({
      data: {
        enrollment_id: enrollment.id,
        provider: PaymentProvider.RAZORPAY,
        provider_order_id: order.id,
        amount_paise: amountPaise,
        status: PaymentStatus.CREATED,
      },
    });
  }

  const s = enrollment.student;
  return {
    orderId,
    amountPaise,
    currency: "INR",
    keyId: publicKeyId(),
    enrollmentId: enrollment.id,
    courseName,
    prefill: {
      name: s?.full_name || fallback.name,
      email: s?.email || fallback.email,
      contact: s?.phone || fallback.contact,
    },
  };
}

/** Token-based order creation (personalised /enroll/[token] flow). */
export async function createPaymentOrder(token: string): Promise<PaymentOrderInfo> {
  const link = await db.enrollmentLink.findUnique({
    where: { token },
    include: {
      lead: { select: { id: true, full_name: true, email: true, mobile: true } },
      batch: { include: { course: true } },
      enrollment: { include: { student: true } },
    },
  });

  if (!link) throw new EnrollError("This enrollment link is not valid.");
  if (link.status === LinkStatus.REVOKED) {
    throw new EnrollError("This enrollment link has been withdrawn. Please contact us.");
  }
  if (link.expires_at < new Date()) {
    throw new EnrollError("This enrollment link has expired. Please ask us for a fresh one.");
  }
  if (!link.enrollment) {
    throw new EnrollError("Please complete the enrollment form before paying.");
  }

  return buildOrderForEnrollment(link.enrollment, link.batch.course.name, {
    name: link.lead.full_name,
    email: link.lead.email,
    contact: link.lead.mobile || "",
  });
}

/** Token-less order creation for the public /[programme]/enroll pages. */
export async function createPaymentOrderForEnrollment(
  enrollmentId: string,
): Promise<PaymentOrderInfo> {
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { student: true, batch: { include: { course: true } } },
  });
  if (!enrollment) throw new EnrollError("Enrollment not found.");

  return buildOrderForEnrollment(enrollment, enrollment.batch.course.name, {
    name: enrollment.student?.full_name || "",
    email: enrollment.student?.email || "",
    contact: enrollment.student?.phone || "",
  });
}

/** Mark a payment as failed (from the checkout `payment.failed` event). */
export async function markPaymentFailed(orderId: string, reason?: string): Promise<void> {
  await db.paymentTransaction.updateMany({
    where: { provider_order_id: orderId, status: PaymentStatus.CREATED },
    data: { status: PaymentStatus.FAILED, raw_payload: { reason: reason ?? "payment_failed" } },
  });
}

/**
 * Idempotently record a captured payment and run fulfillment. Safe to call from
 * BOTH the browser verify callback and the webhook — whichever arrives first
 * does the work; the other no-ops. Returns fulfillment flags so the webhook can
 * decide whether to ask Razorpay to retry.
 */
export async function settleCapturedPayment(input: {
  orderId: string;
  paymentId: string;
  method?: string | null;
  raw?: unknown;
}): Promise<{ enrollmentId: string; confirmed: boolean; invoiceOk: boolean; emailOk: boolean }> {
  const txn = await db.paymentTransaction.findFirst({
    where: { provider_order_id: input.orderId },
    orderBy: { created_at: "desc" },
  });
  if (!txn) throw new EnrollError("No payment record found for this order.");

  // Capture is idempotent — same values on a retry.
  await db.paymentTransaction.update({
    where: { id: txn.id },
    data: {
      status: PaymentStatus.CAPTURED,
      provider_payment_id: input.paymentId,
      method: input.method ?? txn.method,
      raw_payload: (input.raw ?? txn.raw_payload) as Prisma.InputJsonValue,
    },
  });

  const result = await fulfillEnrollment(txn.enrollment_id, input.paymentId);
  return { enrollmentId: txn.enrollment_id, ...result };
}

/**
 * Confirm enrollment → generate invoice (existing generator) → send confirmation
 * email. Every step is guarded independently so a partial failure is safely
 * retryable and never produces duplicates:
 *   • confirmation   — guarded by Enrollment.status
 *   • invoice        — guarded by invoices.enrollment_id UNIQUE
 *   • email          — guarded by an atomic claim on Enrollment.welcome_email_sent_at
 * Post-confirmation steps never throw; they report ok/failed via the return value.
 */
export async function fulfillEnrollment(
  enrollmentId: string,
  paymentId: string,
): Promise<{ confirmed: boolean; invoiceOk: boolean; emailOk: boolean }> {
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: true,
      batch: { include: { course: true } },
    },
  });
  if (!enrollment) throw new EnrollError("Enrollment not found for fulfillment.");

  // ── Step A · confirm enrollment (idempotent) ──
  if (enrollment.status === EnrollmentStatus.PAYMENT_PENDING) {
    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { status: EnrollmentStatus.CONFIRMED },
    });
    await db.activity.create({
      data: {
        type: ActivityType.SYSTEM,
        body: `Payment received — enrollment confirmed (${enrollment.batch.course.name} · ${enrollment.batch.name}).`,
        enrollment_id: enrollment.id,
        student_id: enrollment.student_id,
        lead_id: enrollment.source_lead_id ?? undefined,
      },
    });
    await db.auditLog.create({
      data: {
        action: "enrollment.confirmed",
        entity_type: "enrollment",
        entity_id: enrollment.id,
        after: { payment_id: paymentId, amount_paise: amountPayablePaise(enrollment) },
      },
    });
  }

  // ── Step B · invoice (idempotent via unique enrollment_id) ──
  let invoice: Awaited<ReturnType<typeof findInvoiceByEnrollment>> = await findInvoiceByEnrollment(
    enrollment.id,
  );
  let invoiceOk = Boolean(invoice);
  if (!invoice) {
    try {
      const gstRate = Number(enrollment.batch.course.gst_rate_pct) || 18;
      const totalRupees = amountPayablePaise(enrollment) / 100; // GST-inclusive
      const subtotal = money(totalRupees / (1 + gstRate / 100));
      const extra = (enrollment.student.extra ?? {}) as Record<string, unknown>;
      const address = typeof extra.address === "string" ? extra.address : null;

      invoice = await createInvoice({
        bill_name: enrollment.student.full_name,
        bill_email: enrollment.student.email,
        bill_phone: enrollment.student.phone,
        bill_address: address,
        bill_state: enrollment.student.state,
        lead_id: enrollment.source_lead_id ? Number(enrollment.source_lead_id) : null,
        enrollment_id: enrollment.id,
        items: [
          {
            description: `${enrollment.batch.course.name} — ${enrollment.batch.name}`,
            hsn: enrollment.batch.course.hsn_sac,
            quantity: 1,
            rate: subtotal,
          },
        ],
        tax_rate: gstRate,
        seller_gstin: process.env.SELLER_GSTIN || null,
        place_of_supply: process.env.SELLER_PLACE_OF_SUPPLY || enrollment.student.state || null,
        status: "paid",
      });
      invoiceOk = Boolean(invoice);
    } catch (err) {
      console.error("[enroll] invoice generation failed", err);
      invoiceOk = false;
    }
  }

  // ── Step C · confirmation email (atomic claim → no double-send) ──
  let emailOk = false;
  const claim = await db.enrollment.updateMany({
    where: { id: enrollment.id, welcome_email_sent_at: null },
    data: { welcome_email_sent_at: new Date() },
  });
  if (claim.count === 0) {
    emailOk = true; // already sent (or claimed) by another path
  } else {
    const startDate = enrollment.batch.start_date
      ? new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(
          enrollment.batch.start_date,
        )
      : null;
    const { subject, html } = enrollmentConfirmationEmail({
      firstName: enrollment.student.full_name.split(" ")[0] || "there",
      courseName: enrollment.batch.course.name,
      batchName: enrollment.batch.name,
      startDate,
      amountPaidPaise: amountPayablePaise(enrollment),
      paymentId,
      invoice: invoice
        ? {
            invoice_no: invoice.invoice_no,
            issue_date: invoice.issue_date,
            subtotal: invoice.subtotal,
            tax_amount: invoice.tax_amount,
            tax_rate: invoice.tax_rate,
            total: invoice.total,
            seller_gstin: invoice.seller_gstin,
            place_of_supply: invoice.place_of_supply,
            bill_name: invoice.bill_name,
            items: (invoice.invoice_items ?? []).map(
              (it: { description: string; hsn?: string | null; quantity: number | string; rate: number | string; amount: number | string }) => ({
                description: it.description,
                hsn: it.hsn,
                quantity: it.quantity,
                rate: it.rate,
                amount: it.amount,
              }),
            ),
          }
        : null,
      whatsappUrl: WHATSAPP_URL,
    });

    const res = await sendEmail({ to: enrollment.student.email, subject, html });
    await db.communicationLog.create({
      data: {
        channel: CommChannel.EMAIL,
        to_addr: enrollment.student.email,
        template_key: "enrollment_confirmation",
        entity_ref: enrollment.id,
        provider_message_id: res.id ?? null,
        status: res.ok ? CommStatus.SENT : CommStatus.FAILED,
        error: res.ok ? null : (res.reason ?? "").slice(0, 500),
      },
    });

    if (res.ok) {
      emailOk = true;
    } else {
      // Release the claim so a webhook retry re-attempts the email.
      await db.enrollment.update({
        where: { id: enrollment.id },
        data: { welcome_email_sent_at: null },
      });
      emailOk = false;
    }
  }

  return { confirmed: true, invoiceOk, emailOk };
}
