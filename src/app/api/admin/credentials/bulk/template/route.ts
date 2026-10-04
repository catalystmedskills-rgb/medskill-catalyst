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
  const intern = new URL(req.url).searchParams.get("type") === "INTERNSHIP_COMPLETION";
  return new NextResponse("﻿" + bulkTemplateCsv(intern ? "INT" : "FND", intern ? "INTERNSHIP_COMPLETION" : "COURSE_COMPLETION"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="medskills-${intern ? "internship" : "credentials"}-bulk-template.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
