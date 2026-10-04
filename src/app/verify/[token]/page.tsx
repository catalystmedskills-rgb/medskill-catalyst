import { headers } from "next/headers";
import { clientKey } from "@/src/lib/rate-limit";
import { formatLongDate, parseISODate } from "@/src/modules/credentials/dates";
import { ISSUER_NAME } from "@/src/modules/credentials/config";
import type { PublicCredential } from "@/src/modules/credentials/public";
import { VERIFY_RATE_LIMIT_SURFACE, verifyByToken } from "@/src/modules/credentials/verify";

export const dynamic = "force-dynamic";

const STATUS: Record<PublicCredential["status"], { label: string; tone: string; icon: string; line: (c: PublicCredential) => string }> = {
  VALID: {
    label: "Verified · Valid",
    tone: "border-success/30 bg-emerald-50 text-success",
    icon: "M5 12.5l4.5 4.5L19 7.5",
    line: () => `This credential was issued by ${ISSUER_NAME} and is currently valid.`,
  },
  EXPIRED: {
    label: "Expired",
    tone: "border-warning/30 bg-amber-50 text-warning",
    icon: "M12 7v5l3 2",
    line: (c) => `This credential was issued by ${ISSUER_NAME} and expired on ${c.expiresOn ? formatLongDate(parseISODate(c.expiresOn)!) : "its expiry date"}.`,
  },
  REVOKED: {
    label: "Revoked",
    tone: "border-danger/30 bg-red-50 text-danger",
    icon: "M7 7l10 10M17 7L7 17",
    line: () => `This credential was issued by ${ISSUER_NAME} but has been revoked and is no longer valid.`,
  },
  SUPERSEDED: {
    label: "Replaced",
    tone: "border-brand-navy/20 bg-slate-100 text-brand-navy",
    icon: "M4 12h13M13 7l5 5-5 5",
    line: () => `This credential has been replaced by a newer ${ISSUER_NAME} credential issued to the same person, and is no longer the current record.`,
  },
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-b border-brand-navy/5 py-3.5 last:border-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className={`text-base text-ink ${mono ? "font-mono tracking-wide" : ""}`}>{value}</dd>
    </div>
  );
}

function NotFound({ busy }: { busy: boolean }) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-brand-navy">{busy ? "Please wait a moment" : "Credential not found"}</h1>
      <p className="max-w-xl text-base leading-relaxed text-muted">
        {busy
          ? "Too many unsuccessful lookups came from your connection. Please try again in a few minutes."
          : `This link does not match any ${ISSUER_NAME} credential. Check that the full link or QR code was used, or search by certificate ID.`}
      </p>
      <a href="/verify" className="inline-flex h-11 items-center rounded-pill bg-brand-blue px-6 text-sm font-semibold text-white hover:bg-brand-navy">
        Verify by certificate ID
      </a>
    </div>
  );
}

export default async function CredentialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const outcome = await verifyByToken(token, clientKey(await headers(), VERIFY_RATE_LIMIT_SURFACE));
  if (outcome.kind !== "found") return <NotFound busy={outcome.kind === "rate_limited"} />;
  const c = outcome.credential;
  const s = STATUS[c.status];

  return (
    <article className="space-y-6" aria-labelledby="credential-heading">
      <div className={`flex items-start gap-3 rounded-msc-lg border px-5 py-4 ${s.tone}`} role="status">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          {c.status === "EXPIRED" && <circle cx="12" cy="12" r="9" />}
          <path d={s.icon} />
        </svg>
        <div>
          <p className="text-base font-bold">{s.label}</p>
          <p className="mt-0.5 text-sm leading-relaxed">{s.line(c)}</p>
        </div>
      </div>

      <div className="rounded-msc-lg bg-surface p-6 shadow-msc-md sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-blue">{c.credentialTypeLabel}</p>
        <h1 id="credential-heading" className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-brand-navy sm:text-4xl">
          {c.learnerName}
        </h1>
        <p className="mt-2 text-lg text-ink">{c.internship ? c.internship.internshipTitle : c.programName}</p>

        <dl className="mt-6">
          <Row label="Status" value={s.label} />
          <Row label="Credential type" value={c.credentialTypeLabel} />
          <Row label="Certificate ID" value={c.certificateId} mono />
          {c.internship ? (
            <>
              <Row label="Internship name" value={c.internship.internshipTitle} />
              <Row label="Program" value={c.programName} />
              {c.internship.department && <Row label="Department" value={c.internship.department} />}
              <Row label="Start date" value={formatLongDate(parseISODate(c.internship.startDate)!)} />
              <Row label="End date" value={formatLongDate(parseISODate(c.internship.endDate)!)} />
              <Row label="Duration" value={c.internship.duration} />
            </>
          ) : (
            <Row label="Completed" value={formatLongDate(parseISODate(c.completionDate)!)} />
          )}
          <Row label="Issued" value={formatLongDate(parseISODate(c.issueDate)!)} />
          {c.expiresOn && <Row label={c.status === "EXPIRED" ? "Expired" : "Valid until"} value={formatLongDate(parseISODate(c.expiresOn)!)} />}
          <Row label="Issued by" value={c.issuer} />
        </dl>

        {c.certificateAvailable && (
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`/verify/${outcome.token}/certificate`}
              className="inline-flex h-11 items-center rounded-pill bg-brand-blue px-6 text-sm font-semibold text-white shadow-msc-sm hover:bg-brand-navy"
            >
              View certificate (PDF)
            </a>
          </div>
        )}
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Verifying a different certificate? <a href="/verify" className="font-semibold text-brand-blue underline-offset-2 hover:underline">Search by certificate ID</a>.
      </p>
    </article>
  );
}
