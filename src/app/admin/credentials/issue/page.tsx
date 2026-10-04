import { getStaff } from "@/src/lib/auth";
import { can, Permission } from "@/src/lib/permissions";
import { db } from "@/src/lib/db";
import { indianDate, toISODate } from "@/src/modules/credentials/dates";
import { Flash, PageHeader } from "../_ui";
import { IssueForm } from "./issue-form";

export const dynamic = "force-dynamic";

export default async function IssuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await getStaff();
  if (!staff || !can(staff.role, Permission.CredentialsView)) return null;
  if (!can(staff.role, Permission.CredentialsIssue)) return <p className="text-sm text-danger">You do not have permission to issue credentials.</p>;
  const sp = await searchParams;
  const programs = await db.course.findMany({
    where: { is_active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      credential_type: true,
      batches: { orderBy: { created_at: "desc" }, select: { id: true, name: true } },
      certificate_templates: { where: { status: "ACTIVE" }, select: { id: true } },
    },
  });
  const options = programs.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.credential_type,
    ready: Boolean(p.code) && p.certificate_templates.length > 0,
    reason: !p.code ? "no program code" : p.certificate_templates.length === 0 ? "no active template" : null,
    cohorts: p.batches,
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Issue a credential" subtitle="Choose the credential type, enter the details, review and preview, then confirm. Nothing is issued until you confirm." />
      <Flash error={sp.error} />
      {sp.dup && (
        <p className="text-sm">
          <a className="font-semibold text-brand-blue hover:underline" href={`/admin/credentials/${sp.dup}`}>Open the existing credential →</a>
        </p>
      )}
      <IssueForm programs={options} today={toISODate(indianDate(new Date()))} />
    </div>
  );
}
