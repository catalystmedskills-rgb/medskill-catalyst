import Link from "next/link";
import { getStaff } from "@/src/lib/auth";
import { can, Permission } from "@/src/lib/permissions";
import { dashboardStats } from "@/src/modules/credentials/queries";
import { emailMode } from "@/src/modules/credentials/config";
import { Card, EVENT_LABEL, fmtDateTime, PageHeader, primaryBtn, secondaryBtn } from "./_ui";

export const dynamic = "force-dynamic";


function Stat({ label, value, href, tone = "text-brand-navy" }: { label: string; value: number; href?: string; tone?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold ${tone}`}>{value.toLocaleString("en-IN")}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-msc-lg bg-surface p-5 shadow-msc-sm transition hover:shadow-msc-md">
      {body}
    </Link>
  ) : (
    <Card>{body}</Card>
  );
}

export default async function CredentialsOverview() {
  const staff = await getStaff();
  if (!staff || !can(staff.role, Permission.CredentialsView)) return null;
  const s = await dashboardStats();
  const mode = emailMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credentials"
        subtitle="Issue, verify and manage MedSkills Catalyst certificates."
        actions={
          can(staff.role, Permission.CredentialsIssue) ? (
            <>
              <Link href="/admin/credentials/bulk" className={secondaryBtn}>Bulk issue</Link>
              <Link href="/admin/credentials/issue" className={primaryBtn}>Issue credential</Link>
            </>
          ) : undefined
        }
      />

      {mode.mode !== "live" && (
        <p className="rounded-msc border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Learner emails are <strong>{mode.mode === "off" ? "switched off" : `redirected to ${mode.redirectTo}`}</strong> on this environment
          {mode.note ? ` (${mode.note})` : ""}. No real learner will be emailed.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Valid" value={s.valid} href="/admin/credentials/list?status=VALID" tone="text-success" />
        <Stat label="Expired" value={s.expired} href="/admin/credentials/list?status=EXPIRED" tone="text-warning" />
        <Stat label="Revoked" value={s.revoked} href="/admin/credentials/list?status=REVOKED" tone="text-danger" />
        <Stat label="Superseded" value={s.superseded} href="/admin/credentials/list?status=SUPERSEDED" />
        <Stat label="Issued · 30 days" value={s.issued30} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold text-brand-navy">Needs attention</h2>
          {s.failedCredentials.length === 0 && s.undelivered.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing failed. Every credential generated and every email was delivered or intentionally suppressed.</p>
          ) : (
            <ul className="mt-3 divide-y divide-brand-navy/5 text-sm">
              {s.failedCredentials.map((c) => (
                <li key={c.id} className="py-2.5">
                  <Link href={`/admin/credentials/${c.id}`} className="font-semibold text-danger hover:underline">Generation failed</Link>{" "}
                  · {c.learner_name} <span className="font-mono text-xs text-muted">{c.certificate_id}</span>
                </li>
              ))}
              {s.undelivered.map((d) => (
                <li key={d.id} className="py-2.5">
                  <Link href={`/admin/credentials/${d.credential.id}`} className="font-semibold text-warning hover:underline">Email failed</Link>{" "}
                  · {d.credential.learner_name} <span className="font-mono text-xs text-muted">{d.credential.certificate_id}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-brand-navy">Recent activity</h2>
          <ul className="mt-3 divide-y divide-brand-navy/5 text-sm">
            {s.recent.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium text-ink">{EVENT_LABEL[e.type] ?? e.type}</span>{" "}
                  <Link href={`/admin/credentials/${e.credential.id}`} className="font-mono text-xs text-brand-blue hover:underline">{e.credential.certificate_id}</Link>
                </span>
                <span className="shrink-0 text-xs text-muted">{e.actor?.name ?? "System"} · {fmtDateTime(e.created_at)}</span>
              </li>
            ))}
            {s.recent.length === 0 && <li className="py-2 text-muted">No activity yet.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-lg font-semibold text-brand-navy">By credential type</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="py-2">Type</th><th className="py-2 text-right">Valid</th><th className="py-2 text-right">Revoked</th><th className="py-2 text-right">Superseded</th></tr>
          </thead>
          <tbody>
            {s.types.map((t) => (
              <tr key={t.type} className="border-t border-brand-navy/5">
                <td className="py-2">{t.label}</td>
                <td className="py-2 text-right">{t.valid}</td>
                <td className="py-2 text-right">{t.revoked}</td>
                <td className="py-2 text-right">{t.superseded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {s.programs.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold text-brand-navy">By program</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-2">Program</th><th className="py-2 text-right">Valid</th><th className="py-2 text-right">Revoked</th><th className="py-2 text-right">Superseded</th></tr>
            </thead>
            <tbody>
              {s.programs.map((p) => (
                <tr key={p.name} className="border-t border-brand-navy/5">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 text-right">{p.valid}</td>
                  <td className="py-2 text-right">{p.revoked}</td>
                  <td className="py-2 text-right">{p.superseded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
