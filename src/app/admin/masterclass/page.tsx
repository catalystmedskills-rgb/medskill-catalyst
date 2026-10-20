import Link from "next/link";
import { getStaff } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { MasterclassEmailStatus } from "@/src/generated/prisma/enums";
import { MASTERCLASS_EVENT } from "@/src/modules/masterclass/event";
import { masterclassReadiness, readMasterclassConfig } from "@/src/modules/masterclass/config";
import { ACADEMIC_STATUS_LABELS } from "@/src/modules/masterclass/schema";
import { formatDate, leadCode } from "../ui";
import { retryConfirmationAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const EMAIL_STYLES: Record<MasterclassEmailStatus, string> = {
  PENDING: "bg-brand-pale text-brand-navy",
  SENDING: "bg-warning/10 text-warning",
  SENT: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

export default async function MasterclassAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; email?: string; notice?: string }>;
}) {
  // Layouts are not an auth boundary in the App Router — gate the page itself.
  if (!(await getStaff())) return null;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const emailFilter = Object.values(MasterclassEmailStatus).includes(sp.email as MasterclassEmailStatus)
    ? (sp.email as MasterclassEmailStatus)
    : undefined;
  const where = { event_key: MASTERCLASS_EVENT.key, ...(emailFilter ? { email_status: emailFilter } : {}) };

  const [rows, total, byStatus] = await Promise.all([
    db.masterclassRegistration.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.masterclassRegistration.count({ where }),
    db.masterclassRegistration.groupBy({
      by: ["email_status"],
      where: { event_key: MASTERCLASS_EVENT.key },
      _count: { _all: true },
    }),
  ]);
  const counts = Object.fromEntries(byStatus.map((b) => [b.email_status, b._count._all])) as Partial<
    Record<MasterclassEmailStatus, number>
  >;
  const all = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const readiness = masterclassReadiness(readMasterclassConfig());
  const cfg = readMasterclassConfig();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-brand-navy">Masterclass · {MASTERCLASS_EVENT.dateLabel}</h1>
        <p className="mt-1 text-sm text-muted">
          {all} registered · public page{" "}
          <a href={MASTERCLASS_EVENT.path} target="_blank" className="font-medium text-brand-blue underline">
            {MASTERCLASS_EVENT.path}
          </a>
        </p>
      </div>

      {sp.notice && (
        <div role="status" className="rounded-msc-md border border-brand-blue/20 bg-brand-pale px-4 py-3 text-sm text-brand-navy">
          {sp.notice}
        </div>
      )}

      <section
        className={`rounded-msc-md border px-4 py-3 text-sm ${
          readiness.open ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/5 text-ink"
        }`}
      >
        {readiness.open ? (
          <p className="font-semibold">Registrations are open and confirmation emails are configured.</p>
        ) : (
          <>
            <p className="font-semibold text-warning">Registrations are closed until this is configured:</p>
            <ul className="mt-1 list-disc pl-5 text-muted">
              {readiness.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
        {readiness.warnings.map((w) => (
          <p key={w} className="mt-1 font-semibold text-warning">
            Warning: {w}.
          </p>
        ))}
        {!cfg.whatsappUrl && (
          <p className="mt-1 text-muted">
            MASTERCLASS_WHATSAPP_COMMUNITY_URL is not set — the thank-you page will not redirect to WhatsApp.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/masterclass"
          className={`rounded-pill px-3 py-1 ${!emailFilter ? "bg-brand-navy text-white" : "bg-surface text-brand-navy shadow-msc-sm"}`}
        >
          All ({all})
        </Link>
        {Object.values(MasterclassEmailStatus).map((s) => (
          <Link
            key={s}
            href={`/admin/masterclass?email=${s}`}
            className={`rounded-pill px-3 py-1 ${emailFilter === s ? "bg-brand-navy text-white" : "bg-surface text-brand-navy shadow-msc-sm"}`}
          >
            Email {s.toLowerCase()} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-msc-md bg-surface shadow-msc-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-brand-navy/10 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">University · Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-navy/5">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-brand-navy">{r.full_name}</div>
                  <div className="text-xs text-muted">{r.email}</div>
                  <div className="text-xs text-muted">{r.phone}</div>
                  {r.lead_id !== null && (
                    <Link href={`/admin/leads/${r.lead_id}`} className="text-xs font-medium text-brand-blue underline">
                      {leadCode(r.lead_id)}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-brand-navy">{r.university}</div>
                  <div className="text-xs text-muted">
                    {ACADEMIC_STATUS_LABELS[r.academic_status]}
                    {r.university_source === "manual" ? " · typed manually" : ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {[r.utm_source, r.utm_medium, r.utm_campaign].filter(Boolean).join(" / ") || "direct"}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-pill px-2.5 py-0.5 text-xs font-semibold ${EMAIL_STYLES[r.email_status]}`}>
                    {r.email_status}
                  </span>
                  <div className="mt-1 text-xs text-muted">
                    {r.email_attempts} attempt{r.email_attempts === 1 ? "" : "s"}
                    {r.email_provider_id ? ` · ${r.email_provider_id.slice(0, 8)}…` : ""}
                  </div>
                  <div className="mt-1 text-xs font-semibold">
                    {r.payment_status === "NOT_REQUIRED" && <span className="text-muted">Free registration</span>}
                    {r.payment_status === "PAID" && (
                      <span className="text-success" title={r.razorpay_payment_id ?? ""}>
                        Paid ₹{(r.amount_paise / 100).toLocaleString("en-IN")}
                      </span>
                    )}
                    {r.payment_status === "PENDING" && <span className="text-warning">Payment pending — no Zoom link sent</span>}
                    {r.payment_status === "FAILED" && <span className="text-danger">Payment failed — no Zoom link sent</span>}
                  </div>
                  {r.email_last_error && r.email_status !== "SENT" && (
                    <div className="mt-1 max-w-[220px] truncate text-xs text-danger" title={r.email_last_error}>
                      {r.email_last_error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.email_status !== "SENT" && (r.payment_status === "NOT_REQUIRED" || r.payment_status === "PAID") && (
                    <form action={retryConfirmationAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-msc border border-brand-navy/15 px-3 py-1.5 text-xs font-semibold text-brand-navy transition hover:border-brand-blue hover:text-brand-blue"
                      >
                        Retry email
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/masterclass?page=${page - 1}${emailFilter ? `&email=${emailFilter}` : ""}`} className="text-brand-blue underline">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`/admin/masterclass?page=${page + 1}${emailFilter ? `&email=${emailFilter}` : ""}`} className="text-brand-blue underline">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
