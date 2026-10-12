import { NextResponse } from "next/server";
import { AuthError, requirePermission } from "@/src/lib/auth";
import { Permission } from "@/src/lib/permissions";
import { bulkTemplateCsv } from "@/src/modules/credentials/bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permission.CredentialsBulkIssue);
  } catch (e) {
    return new NextResponse("Unauthorized", { status: e instanceof AuthError ? e.status : 500 });
  }
  const t = new URL(req.url).searchParams.get("type");
  const type = t === "INTERNSHIP_COMPLETION" || t === "OFFER_LETTER" ? t : "COURSE_COMPLETION";
  const code = type === "INTERNSHIP_COMPLETION" ? "INT" : type === "OFFER_LETTER" ? "OFR" : "FND";
  const name = type === "INTERNSHIP_COMPLETION" ? "internship" : type === "OFFER_LETTER" ? "offer-letter" : "credentials";
  return new NextResponse("\ufeff" + bulkTemplateCsv(code, type), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="medskills-${name}-bulk-template.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
