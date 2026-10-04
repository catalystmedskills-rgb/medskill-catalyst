import { getStaff } from "@/src/lib/auth";
import { can, Permission } from "@/src/lib/permissions";
import { listPrograms } from "@/src/modules/credentials/queries";
import { updateProgramAction } from "../actions";
import { Card, Flash, inputCls, PageHeader, secondaryBtn } from "../_ui";
import { CREDENTIAL_TYPE_DEFINITIONS, CREDENTIAL_TYPES } from "@/src/modules/credentials/credential-types";

export const dynamic = "force-dynamic";

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await getStaff();
  if (!staff || !can(staff.role, Permission.CredentialsView)) return null;
  const manage = can(staff.role, Permission.ProgramsManage);
  const sp = await searchParams;
  const programs = await listPrograms();

  return (
    <div className="space-y-5">
      <PageHeader title="Programs" subtitle="Credential settings for each program. Programs themselves come from the existing course catalog." />
      <Flash error={sp.error} ok={sp.ok ? "Program settings saved." : undefined} />
      <p className="text-sm text-muted">
        A program needs a <strong>program code</strong> (used in certificate IDs, e.g. MSC-2026-<strong>FND</strong>-7K4P92) and an <strong>active template</strong> before
        it can issue credentials. Changing a code affects only future certificate IDs. Each program issues one <strong>credential type</strong>; it is
        fixed once the program has issued anything.
      </p>
      <div className="space-y-4">
        {programs.map((p) => {
          const active = p.certificate_templates.find((t) => t.status === "ACTIVE");
          return (
            <Card key={p.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-brand-navy">{p.name}</h2>
                <span className="text-xs text-muted">
                  {p._count.credentials} credentials · {p.batches.length} cohorts · template: {active ? `v${active.version}${active.is_production ? "" : " (dev)"}` : "none active"}
                  {!p.is_active && " · inactive program"}
                </span>
              </div>
              <form action={updateProgramAction} className="mt-4 grid gap-3 sm:grid-cols-[180px_120px_1fr_160px_1.4fr_auto]">
                <input type="hidden" name="courseId" value={p.id} />
                <label className="space-y-1 text-xs font-semibold text-brand-navy">
                  Credential type
                  <select name="credentialType" defaultValue={p.credential_type} disabled={!manage || p._count.credentials > 0} className={inputCls}>
                    {CREDENTIAL_TYPES.map((t) => (
                      <option key={t} value={t}>{CREDENTIAL_TYPE_DEFINITIONS[t].label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-brand-navy">
                  Code
                  <input name="code" defaultValue={p.code ?? ""} maxLength={10} pattern="[A-Za-z0-9]{2,10}" placeholder="FND" disabled={!manage} className={`${inputCls} font-mono uppercase`} />
                </label>
                <label className="space-y-1 text-xs font-semibold text-brand-navy">
                  Validity (months, blank = lifetime)
                  <input name="validityMonths" type="number" min={1} max={600} defaultValue={p.validity_months ?? ""} disabled={!manage} className={inputCls} />
                </label>
                <label className="space-y-1 text-xs font-semibold text-brand-navy">
                  Counted from
                  <select name="validityAnchor" defaultValue={p.validity_anchor} disabled={!manage} className={inputCls}>
                    <option value="COMPLETION">Completion date</option>
                    <option value="ISSUE">Issue date</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-brand-navy">
                  Title on certificate (blank = program name)
                  <input name="certificateTitle" defaultValue={p.certificate_title ?? ""} maxLength={160} placeholder={p.name} disabled={!manage} className={inputCls} />
                </label>
                {manage && <button className={`${secondaryBtn} self-end`}>Save</button>}
              </form>
            </Card>
          );
        })}
        {programs.length === 0 && <p className="text-sm text-muted">No programs in the course catalog yet.</p>}
      </div>
    </div>
  );
}
