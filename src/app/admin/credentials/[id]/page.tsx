import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getStaff, isSharedIdentity } from "@/src/lib/auth";
import { can, Permission } from "@/src/lib/permissions";
import { getCredentialDetail } from "@/src/modules/credentials/queries";
import { derivePublicStatus } from "@/src/modules/credentials/status";
import { verificationUrl } from "@/src/modules/credentials/config";
import { toISODate } from "@/src/modules/credentials/dates";
import { reissueAction, resendAction, retryAction, revokeAction } from "../actions";
import { Card, CredentialStatusBadge, dangerBtn, EVENT_LABEL, Flash, fmtDate, fmtDateTime, inputCls, primaryBtn, secondaryBtn } from "../_ui";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  issued: "Credential issued.",
  resent: "Email resent.",
  "resend-suppressed": "Resend recorded, but emails are switched off on this environment.",
  "resend-failed": "Resend attempted but the email provider reported a failure. See deliveries below.",
  retried: "Retry finished. See the status below.",
  revoked: "Credential revoked. The public page now shows it as revoked.",
  reissued: "Replacement credential issued. The original now shows as replaced.",
};

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 border-b border-brand-navy/5 py-2.5 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-ink">{children}</dd>
    </div>
  );
}

export default async function CredentialDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await getStaff();
  if (!staff || !can(staff.role, Permission.CredentialsView)) return null;
  const { id } = await params;
  const sp = await searchParams;
  const c = await getCredentialDetail(id);
  if (!c) notFound();

  const priv = can(staff.role, Permission.CredentialsViewPrivate);
  const full = can(staff.role, Permission.AuditViewFull);
  const shared = isSharedIdentity(staff);
  const display = derivePublicStatus(c) ?? c.status;
  const url = verificationUrl(c.verification_token);
  const canResend = can(staff.role, Permission.CredentialsResend) && !shared && c.status === "VALID";
  const canRetry = can(staff.role, Permission.CredentialsIssue) && !shared && c.status === "FAILED";
  const canRevoke = can(staff.role, Permission.CredentialsRevoke) && !shared && c.status === "VALID";
  const canReissue = can(staff.role, Permission.CredentialsReissue) && !shared && (c.status === "VALID" || c.status === "REVOKED") && !c.superseded_by;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm font-semibold tracking-wide text-brand-blue">{c.certificate_id}</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-brand-navy">{c.learner_name}</h1>
          <p className="mt-1 text-sm text-muted">{c.program_name}{c.batch ? ` · ${c.batch.name}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CredentialStatusBadge status={display} />
          {c.pdf_path && <a href={`/api/admin/credentials/${c.id}/pdf`} target="_blank" rel="noopener" className={secondaryBtn}>View PDF</a>}
          {derivePublicStatus(c) && <a href={url} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>Public page</a>}
          {canResend && (
            <form action={resendAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className={secondaryBtn}>Resend email</button>
            </form>
          )}
          {canRetry && (
            <form action={retryAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className={primaryBtn}>Retry generation</button>
            </form>
          )}
        </div>
      </div>

      <Flash error={sp.error} ok={sp.ok ? OK[sp.ok] : undefined} />

      {c.status === "FAILED" && (
        <p className="rounded-msc border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">
          Certificate generation failed, so this credential is not publicly verifiable and no email was sent. {c.last_error ? `Reason: ${c.last_error}` : ""}
        </p>
      )}
      {!c.template.is_production && (
        <p className="rounded-msc border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Rendered with a non-production development template (watermarked specimen).
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold text-brand-navy">Record</h2>
          <dl className="mt-2">
            <Item label="Status">{display}{c.status === "REVOKED" && c.revoked_at ? ` on ${fmtDateTime(c.revoked_at)} by ${c.revoked_by?.name ?? "—"}` : ""}</Item>
            {c.status === "REVOKED" && full && <Item label="Internal reason">{c.revocation_reason}</Item>}
            <Item label="Completed">{fmtDate(c.completion_date)}</Item>
            <Item label="Issued">{fmtDateTime(c.issued_at)}</Item>
            <Item label="Expires">{c.expires_at ? fmtDate(c.expires_at) : "Never"}</Item>
            {priv && <Item label="Learner email">{c.student.email}</Item>}
            <Item label="Template">{c.template.name} · v{c.template.version}</Item>
            <Item label="Issued by">{c.created_by.name}</Item>
            <Item label="Source">{c.source.toLowerCase()}</Item>
            {c.supersedes && (
              <Item label="Replaces"><Link href={`/admin/credentials/${c.supersedes.id}`} className="font-mono text-brand-blue hover:underline">{c.supersedes.certificate_id}</Link> ({c.supersedes.status.toLowerCase()})</Item>
            )}
            {c.superseded_by && (
              <Item label="Replaced by"><Link href={`/admin/credentials/${c.superseded_by.id}`} className="font-mono text-brand-blue hover:underline">{c.superseded_by.certificate_id}</Link> ({c.superseded_by.status.toLowerCase()})</Item>
            )}
            {derivePublicStatus(c) && <Item label="Verification URL"><span className="break-all font-mono text-xs">{url}</span></Item>}
            {c.pdf_sha256 && <Item label="PDF SHA-256"><span className="break-all font-mono text-xs">{c.pdf_sha256}</span></Item>}
          </dl>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-brand-navy">Email deliveries</h2>
          <ul className="mt-2 divide-y divide-brand-navy/5 text-sm">
            {c.deliveries.map((d) => (
              <li key={d.id} className="py-2.5">
                <span className={`font-semibold ${d.status === "SENT" ? "text-success" : d.status === "FAILED" ? "text-danger" : "text-muted"}`}>{d.status.charAt(0) + d.status.slice(1).toLowerCase()}</span>{" "}
                · {d.kind === "RESEND" ? "Resend" : "Issue email"}
                {priv && <> · <span className="text-muted">{d.recipient}</span></>}
                <span className="block text-xs text-muted">{fmtDateTime(d.created_at)} · {d.triggered_by?.name ?? "—"}{d.last_error ? ` · ${d.last_error}` : ""}</span>
              </li>
            ))}
            {c.deliveries.length === 0 && <li className="py-2.5 text-muted">No emails yet.</li>}
          </ul>
        </Card>
      </div>

      {(canRevoke || canReissue) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {canRevoke && (
            <details className="rounded-msc-lg border border-danger/20 bg-surface p-5 shadow-msc-sm" open={sp.panel === "revoke"}>
              <summary className="cursor-pointer font-display text-lg font-semibold text-danger">Revoke</summary>
              <form action={revokeAction} className="mt-4 space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="certificateId" value={c.certificate_id} />
                <p className="text-sm text-muted">The public page will show this credential as revoked. The internal reason is never shown publicly. This cannot be undone. To correct a certificate, use Reissue instead.</p>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-semibold text-brand-navy">Internal reason</span>
                  <textarea name="reason" required minLength={5} maxLength={1000} rows={3} className="w-full rounded-msc border border-brand-navy/15 p-3 text-sm" />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-semibold text-brand-navy">Type <span className="font-mono">{c.certificate_id}</span> to confirm</span>
                  <input name="confirm" required autoComplete="off" className={`${inputCls} font-mono`} />
                </label>
                <button className={dangerBtn}>Revoke credential</button>
              </form>
            </details>
          )}
          {canReissue && (
            <details className="rounded-msc-lg bg-surface p-5 shadow-msc-sm" open={sp.panel === "reissue"}>
              <summary className="cursor-pointer font-display text-lg font-semibold text-brand-navy">Reissue (correct and replace)</summary>
              <form action={reissueAction} className="mt-4 space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="idempotencyKey" value={`reissue-${randomUUID()}`} />
                <p className="text-sm text-muted">
                  Creates a new credential with a new ID and QR code, linked to this one.{" "}
                  {c.status === "VALID" ? "This credential will show as replaced." : "This credential stays revoked."}
                </p>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-semibold text-brand-navy">Name on certificate</span>
                  <input name="fullName" defaultValue={c.learner_name} maxLength={120} className={inputCls} />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-semibold text-brand-navy">Completion date</span>
                  <input name="completionDate" type="date" defaultValue={toISODate(c.completion_date)} className={inputCls} />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-semibold text-brand-navy">Cohort</span>
                  <select name="batchId" defaultValue="__keep__" className={inputCls}>
                    <option value="__keep__">Keep: {c.batch?.name ?? "No cohort"}</option>
                    <option value="">No cohort</option>
                    {c.course.batches.filter((b) => b.id !== c.batch_id).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-semibold text-brand-navy">Reason for reissue (internal)</span>
                  <textarea name="reason" required minLength={5} maxLength={1000} rows={2} className="w-full rounded-msc border border-brand-navy/15 p-3 text-sm" />
                </label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sendEmail" className="h-4 w-4 accent-brand-blue" /> Email the learner the new credential</label>
                <button className={primaryBtn}>Reissue</button>
              </form>
            </details>
          )}
        </div>
      )}

      <Card>
        <h2 className="font-display text-lg font-semibold text-brand-navy">Audit history</h2>
        <ol className="mt-3 space-y-0 text-sm">
          {c.events.map((e) => {
            const meta = e.metadata as Record<string, unknown>;
            const visible = Object.entries(meta).filter(([k]) => full || (k !== "reason" && k !== "error"));
            return (
              <li key={e.id} className="grid gap-1 border-b border-brand-navy/5 py-2.5 last:border-0 sm:grid-cols-[180px_1fr]">
                <span className="text-xs text-muted">{fmtDateTime(e.created_at)}</span>
                <span>
                  <span className="font-semibold text-ink">{EVENT_LABEL[e.type] ?? e.type}</span> · {e.actor?.name ?? "System"}
                  {visible.length > 0 && <span className="block text-xs text-muted">{visible.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
