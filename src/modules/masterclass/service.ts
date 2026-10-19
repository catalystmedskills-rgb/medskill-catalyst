import "server-only";
import { db } from "@/src/lib/db";
import { sendEmail } from "@/src/lib/email";
import { Prisma } from "@/src/generated/prisma/client";
import {
  ActivityType,
  CommChannel,
  CommStatus,
  MasterclassEmailStatus,
} from "@/src/generated/prisma/enums";
import { MASTERCLASS_EVENT } from "./event";
import { readMasterclassConfig, timeLabel, type MasterclassConfig } from "./config";
import { masterclassConfirmationEmail } from "./email-template";
import { isPermanentEmailFailure, MAX_EMAIL_ATTEMPTS, nextAttemptAt, STALE_CLAIM_MS } from "./delivery";
import { leadSourceFor } from "./attribution";
import { ACADEMIC_STATUS_LABELS, firstNameOf, type RegistrationRequest } from "./schema";

/**
 * Masterclass registration + confirmation email.
 *
 * Ordering is the whole design:
 *   1. The registration row is written first. Nothing after it can undo it.
 *   2. The CRM lead is linked best-effort; a failure there is logged, not fatal.
 *   3. The email is sent through an atomic claim (PENDING/FAILED → SENDING), so
 *      the in-request send, the retry sweep and an admin "retry" can race
 *      without ever sending twice; Resend's Idempotency-Key covers the one gap
 *      a claim cannot (a timeout after Resend already accepted the message).
 *   4. SENT is recorded only when Resend returned a message id.
 */

export type EmailStatus = `${MasterclassEmailStatus}`;

export type RegisterOutcome = {
  kind: "created" | "duplicate";
  id: string;
  firstName: string;
  email: string;
  emailStatus: EmailStatus;
};

const EVENT_KEY = MASTERCLASS_EVENT.key;
const EMAIL_TEMPLATE_KEY = "masterclass_confirmation";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function findExisting(email: string, phone: string) {
  return db.masterclassRegistration.findFirst({
    where: { event_key: EVENT_KEY, OR: [{ email }, { phone }] },
    orderBy: { created_at: "asc" },
    select: { id: true, full_name: true, email: true, email_status: true },
  });
}

/**
 * Save a registration. Idempotent per student: a second submission with the
 * same email OR phone returns the original registration unchanged.
 */
export async function registerForMasterclass(input: RegistrationRequest): Promise<RegisterOutcome> {
  const existing = await findExisting(input.email, input.phone);
  if (existing) {
    return {
      kind: "duplicate",
      id: existing.id,
      firstName: firstNameOf(existing.full_name),
      email: existing.email,
      emailStatus: existing.email_status,
    };
  }

  const a = input.attribution ?? {};
  let created;
  try {
    created = await db.masterclassRegistration.create({
      data: {
        event_key: EVENT_KEY,
        full_name: input.fullName,
        email: input.email,
        phone: input.phone,
        university: input.university,
        university_source: input.universitySource,
        academic_status: input.academicStatus,
        consent_at: new Date(),
        consent_text_version: MASTERCLASS_EVENT.consentTextVersion,
        utm_source: a.utm_source || null,
        utm_medium: a.utm_medium || null,
        utm_campaign: a.utm_campaign || null,
        utm_content: a.utm_content || null,
        utm_term: a.utm_term || null,
        gclid: a.gclid || null,
        fbclid: a.fbclid || null,
        referrer: a.referrer || null,
        landing_page: a.landing_page || MASTERCLASS_EVENT.path,
      },
      select: { id: true, full_name: true, email: true, email_status: true },
    });
  } catch (err) {
    // Two submissions raced past findExisting; the loser reports the winner.
    if (isUniqueViolation(err)) {
      const winner = await findExisting(input.email, input.phone);
      if (winner) {
        return {
          kind: "duplicate",
          id: winner.id,
          firstName: firstNameOf(winner.full_name),
          email: winner.email,
          emailStatus: winner.email_status,
        };
      }
    }
    throw err;
  }

  await linkToLead(created.id, input).catch((err) => {
    console.error("[masterclass] lead link failed for registration", created.id, err);
  });

  return {
    kind: "created",
    id: created.id,
    firstName: firstNameOf(created.full_name),
    email: created.email,
    emailStatus: created.email_status,
  };
}

/**
 * Mirror the registration into the CRM `leads` table so admissions sees it in
 * /admin. Phone is the lead's identity (see src/pages/api/register.ts); email
 * is the fallback. An existing lead is never downgraded — only blank
 * attribution is filled in and the masterclass details are added to `extra`.
 */
async function linkToLead(registrationId: string, input: RegistrationRequest): Promise<void> {
  const a = input.attribution ?? {};
  const statusLabel = ACADEMIC_STATUS_LABELS[input.academicStatus];
  const detail = {
    registration_id: registrationId,
    event: MASTERCLASS_EVENT.key,
    university: input.university,
    academic_status: statusLabel,
    registered_at: new Date().toISOString(),
  };

  const existing =
    (await db.lead.findFirst({ where: { mobile: input.phone }, orderBy: { created_at: "asc" } })) ??
    (await db.lead.findUnique({ where: { email: input.email } }));

  let leadId: bigint;
  if (existing) {
    const extra = (existing.extra && typeof existing.extra === "object" && !Array.isArray(existing.extra)
      ? existing.extra
      : {}) as Record<string, unknown>;
    await db.lead.update({
      where: { id: existing.id },
      data: {
        updated_at: new Date(),
        mobile: existing.mobile || input.phone,
        utm_source: existing.utm_source || a.utm_source || null,
        utm_medium: existing.utm_medium || a.utm_medium || null,
        utm_campaign: existing.utm_campaign || a.utm_campaign || null,
        landing_page: existing.landing_page || a.landing_page || MASTERCLASS_EVENT.path,
        extra: { ...extra, masterclass_2026_10_24: detail } as Prisma.InputJsonValue,
      },
    });
    leadId = existing.id;
  } else {
    try {
      const lead = await db.lead.create({
        data: {
          full_name: input.fullName,
          email: input.email,
          mobile: input.phone,
          form_type: "masterclass",
          background: statusLabel,
          consent: true,
          utm_source: a.utm_source || null,
          utm_medium: a.utm_medium || null,
          utm_campaign: a.utm_campaign || null,
          landing_page: a.landing_page || MASTERCLASS_EVENT.path,
          source: leadSourceFor(a),
          attribution: a as Prisma.InputJsonValue,
          extra: {
            source: "Masterclass registration",
            university: input.university,
            academic_status: statusLabel,
            masterclass_2026_10_24: detail,
          } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      leadId = lead.id;
    } catch (err) {
      // A concurrent lead capture created this email first — link to it.
      if (!isUniqueViolation(err)) throw err;
      const lead = await db.lead.findUnique({ where: { email: input.email }, select: { id: true } });
      if (!lead) throw err;
      leadId = lead.id;
    }
  }

  await db.masterclassRegistration.update({ where: { id: registrationId }, data: { lead_id: leadId } });
  await db.activity.create({
    data: {
      type: ActivityType.SYSTEM,
      lead_id: leadId,
      body: `Registered for the ${MASTERCLASS_EVENT.title} (${MASTERCLASS_EVENT.dateLabel}) — ${input.university}, ${statusLabel}.`,
    },
  });
}

// ── Confirmation email ───────────────────────────────────────────────

/** Can the confirmation email be built right now? */
function emailConfigReady(cfg: MasterclassConfig): boolean {
  return Boolean(cfg.zoomUrl && cfg.startTime && cfg.resendConfigured);
}

/**
 * Atomically take ownership of a registration's email. Returns false when
 * another worker owns it, it is already SENT, it is not due yet, or it has
 * used up its attempts.
 *
 * `force` (a student re-submitting, or an admin pressing retry) skips the
 * backoff wait and grants attempts beyond the automatic limit.
 */
async function claim(id: string, force: boolean): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const retryable: Prisma.MasterclassRegistrationWhereInput = force
    ? { email_status: { in: [MasterclassEmailStatus.PENDING, MasterclassEmailStatus.FAILED] } }
    : {
        email_status: { in: [MasterclassEmailStatus.PENDING, MasterclassEmailStatus.FAILED] },
        email_attempts: { lt: MAX_EMAIL_ATTEMPTS },
        OR: [{ email_next_attempt_at: null }, { email_next_attempt_at: { lte: now } }],
      };
  const res = await db.masterclassRegistration.updateMany({
    where: {
      id,
      OR: [
        retryable,
        { email_status: MasterclassEmailStatus.SENDING, email_claimed_at: { lt: staleBefore } },
      ],
    },
    data: {
      email_status: MasterclassEmailStatus.SENDING,
      email_claimed_at: now,
      email_attempts: { increment: 1 },
    },
  });
  return res.count === 1;
}

async function logCommunication(
  to: string,
  registrationId: string,
  status: CommStatus,
  providerId?: string,
  error?: string,
) {
  try {
    await db.communicationLog.create({
      data: {
        channel: CommChannel.EMAIL,
        to_addr: to,
        template_key: EMAIL_TEMPLATE_KEY,
        entity_ref: `masterclass_registration:${registrationId}`,
        provider_message_id: providerId ?? null,
        status,
        error: error ?? null,
      },
    });
  } catch (err) {
    console.error("[masterclass] communication log write failed:", err);
  }
}

/**
 * Send (or retry) the confirmation email for one registration and record the
 * outcome. Never throws for delivery problems; returns the resulting status.
 */
export async function deliverConfirmation(
  id: string,
  opts: { force?: boolean; config?: MasterclassConfig } = {},
): Promise<EmailStatus> {
  const cfg = opts.config ?? readMasterclassConfig();
  const current = await db.masterclassRegistration.findUnique({
    where: { id },
    select: { email_status: true },
  });
  if (!current) throw new Error(`masterclass registration ${id} not found`);

  // Without a Zoom link and time there is nothing correct to send. Leave the
  // row untouched (no attempt spent) so the sweep sends it once configured.
  if (!emailConfigReady(cfg)) return current.email_status;
  if (!(await claim(id, Boolean(opts.force)))) {
    const now = await db.masterclassRegistration.findUnique({ where: { id }, select: { email_status: true } });
    return now?.email_status ?? current.email_status;
  }

  const reg = await db.masterclassRegistration.findUniqueOrThrow({
    where: { id },
    select: { full_name: true, email: true, email_attempts: true },
  });

  const message = masterclassConfirmationEmail({
    firstName: firstNameOf(reg.full_name),
    zoomUrl: cfg.zoomUrl!,
    timeLabel: timeLabel(cfg)!,
    whatsappUrl: cfg.whatsappUrl,
    meetingId: cfg.zoomMeetingId,
    passcode: cfg.zoomPasscode,
  });

  const result = await sendEmail({
    to: reg.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    idempotencyKey: `masterclass-confirmation/${id}`,
    timeoutMs: 10_000,
  });

  if (result.ok && result.id) {
    await db.masterclassRegistration.update({
      where: { id },
      data: {
        email_status: MasterclassEmailStatus.SENT,
        email_provider_id: result.id,
        email_sent_at: new Date(),
        email_last_error: null,
        email_next_attempt_at: null,
        email_claimed_at: null,
      },
    });
    await logCommunication(reg.email, id, CommStatus.SENT, result.id);
    return MasterclassEmailStatus.SENT;
  }

  const reason = (result.ok ? "resend_accepted_without_message_id" : result.reason ?? "unknown").slice(0, 500);
  await db.masterclassRegistration.update({
    where: { id },
    data: {
      email_status: MasterclassEmailStatus.FAILED,
      email_last_error: reason,
      email_next_attempt_at: nextAttemptAt(reg.email_attempts, isPermanentEmailFailure(reason)),
      email_claimed_at: null,
    },
  });
  await logCommunication(reg.email, id, CommStatus.FAILED, undefined, reason);
  console.error("[masterclass] confirmation email failed for", id, "-", reason);
  return MasterclassEmailStatus.FAILED;
}

/**
 * Retry every confirmation that is due: never-attempted PENDING rows, FAILED
 * rows whose backoff has elapsed, and SENDING rows abandoned by a crashed
 * worker. Called by the cron route and opportunistically after registrations.
 */
export async function processDueConfirmations(limit = 20): Promise<{ attempted: number; sent: number }> {
  const cfg = readMasterclassConfig();
  if (!emailConfigReady(cfg)) return { attempted: 0, sent: 0 };
  const now = new Date();
  const due = await db.masterclassRegistration.findMany({
    where: {
      event_key: EVENT_KEY,
      OR: [
        {
          email_status: { in: [MasterclassEmailStatus.PENDING, MasterclassEmailStatus.FAILED] },
          email_attempts: { lt: MAX_EMAIL_ATTEMPTS },
          OR: [{ email_next_attempt_at: null }, { email_next_attempt_at: { lte: now } }],
        },
        {
          email_status: MasterclassEmailStatus.SENDING,
          email_claimed_at: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
        },
      ],
    },
    orderBy: { created_at: "asc" },
    take: limit,
    select: { id: true },
  });
  let sent = 0;
  for (const { id } of due) {
    if ((await deliverConfirmation(id, { config: cfg })) === MasterclassEmailStatus.SENT) sent++;
  }
  return { attempted: due.length, sent };
}

/** For the thank-you page: enough to confirm the save, nothing more. */
export async function getRegistrationSummary(id: string) {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  try {
    const r = await db.masterclassRegistration.findFirst({
      where: { id, event_key: EVENT_KEY },
      select: { full_name: true, email: true },
    });
    return r ? { firstName: firstNameOf(r.full_name), email: r.email } : null;
  } catch (err) {
    console.error("[masterclass] summary lookup failed:", err);
    return null;
  }
}
