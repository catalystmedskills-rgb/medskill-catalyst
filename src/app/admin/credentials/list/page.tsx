import Link from "next/link";
import { getStaff } from "@/src/lib/auth";
import { can, Permission } from "@/src/lib/permissions";
import { db } from "@/src/lib/db";
import { listCredentials, listFiltersSchema } from "@/src/modules/credentials/queries";
import { CredentialStatusBadge, fmtDate, inputCls, PageHeader, secondaryBtn } from "../_ui";
import { CREDENTIAL_TYPE_DEFINITIONS, CREDENTIAL_TYPES } from "@/src/modules/credentials/credential-types";

export const dynamic = "force-dynamic";

export default async function CredentialListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaff();
  if (!staff || !can(staff.role, Permission.CredentialsView)) return null;
  const includePrivate = can(staff.role, Permission.CredentialsViewPrivate);
  const raw = await searchParams;
  const pick = (k: string) => (typeof raw[k] === "string" && raw[k] !== "" ? (raw[k] as string) : undefined);
  const parsed = listFiltersSchema.safeParse({ q: pick("q"), courseId: pick("courseId"), type: pick("type"), batchId: pick("batchId"), status: pick("status"), from: pick("from"), to: pick("to"), page: pick("page") });
  const f = parsed.success ? parsed.data : { page: 1 };
  const [{ rows, total, pages }, programs] = await Promise.all([
    listCredentials(f, includePrivate),
    db.course.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, batches: { select: { id: true, name: true }, orderBy: { created_at: "desc" } } } }),
  ]);
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...over })) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Credentials" subtitle={`${total.toLocaleString("en-IN")} matching`} />
      <form method="GET" className="grid gap-2 rounded-msc-lg bg-surface p-4 shadow-msc-sm sm:grid-cols-2 lg:grid-cols-[2fr_1.1fr_1.2fr_1fr_1fr_1fr_1fr_auto]">
        <input type="search" name="q" defaultValue={f.q ?? ""} aria-label="Search" placeholder={includePrivate ? "Certificate ID, name, email or internship name" : "Certificate ID, name or internship name"} className={inputCls} />
        <select name="type" defaultValue={"type" in f ? (f.type ?? "") : ""} aria-label="Credential type" className={inputCls}>
          <option value="">All types</option>
          {CREDENTIAL_TYPES.map((t) => <option key={t} value={t}>{CREDENTIAL_TYPE_DEFINITIONS[t].label}</option>)}
        </select>
        <select name="courseId" defaultValue={f.courseId ?? ""} aria-label="Program" className={inputCls}>
          <option value="">All programs</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="batchId" defaultValue={f.batchId ?? ""} aria-label="Cohort" className={inputCls}>
          <option value="">All cohorts</option>
          {programs.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </optgroup>
          ))}
        </select>
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status" className={inputCls}>
          <option value="">Any status</option>
          {["VALID", "EXPIRED", "REVOKED", "SUPERSEDED", "FAILED", "ISSUING"].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
        <input type="date" name="from" defaultValue={f.from ?? ""} aria-label="Issued from" className={inputCls} />
        <input type="date" name="to" defaultValue={f.to ?? ""} aria-label="Issued to" className={inputCls} />
        <button className={secondaryBtn}>Filter</button>
      </form>

      <div className="overflow-x-auto rounded-msc-lg bg-surface shadow-msc-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-brand-navy/10 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Certificate ID</th>
              <th className="px-4 py-3">Learner</th>
              <th className="px-4 py-3">Type · program</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-brand-navy/5 last:border-0 hover:bg-brand-pale/40">
                <td className="px-4 py-3"><Link href={`/admin/credentials/${r.id}`} className="font-mono text-xs font-semibold text-brand-blue hover:underline">{r.certificateId}</Link></td>
                <td className="px-4 py-3"><span className="font-medium text-brand-navy">{r.learnerName}</span>{r.email && <span className="block text-xs text-muted">{r.email}</span>}</td>
                <td className="px-4 py-3">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-brand-blue">{CREDENTIAL_TYPE_DEFINITIONS[r.credentialType].label}</span>
                  {r.internshipTitle ? <span className="block">{r.internshipTitle}</span> : null}
                  <span className={r.internshipTitle ? "block text-xs text-muted" : ""}>{r.programName}</span>
                  {r.cohort && <span className="block text-xs text-muted">{r.cohort}</span>}
                </td>
                <td className="px-4 py-3">{fmtDate(r.completionDate)}</td>
                <td className="px-4 py-3">{fmtDate(r.issuedAt)}</td>
                <td className="px-4 py-3"><CredentialStatusBadge status={r.displayStatus} /></td>
                <td className="px-4 py-3 text-xs">{r.lastDelivery ? r.lastDelivery.charAt(0) + r.lastDelivery.slice(1).toLowerCase() : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No credentials match.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          {(f.page ?? 1) > 1 ? <Link href={qs({ page: (f.page ?? 1) - 1 })} className="text-brand-blue hover:underline">← Previous</Link> : <span />}
          <span className="text-muted">Page {f.page ?? 1} of {pages}</span>
          {(f.page ?? 1) < pages ? <Link href={qs({ page: (f.page ?? 1) + 1 })} className="text-brand-blue hover:underline">Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
