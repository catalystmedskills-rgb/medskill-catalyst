import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { AuthError, requireStaff } from "@/src/lib/auth";
import { safeSpreadsheetCell } from "@/src/lib/spreadsheet-export";
import { db } from "@/src/lib/db";
import type { Prisma } from "@/src/generated/prisma/client";
import { LeadStatus, LeadSource } from "@/src/generated/prisma/enums";
import { STATUS_LABELS, SOURCE_LABELS, leadCode } from "@/src/app/admin/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "Lead ID", "Captured", "Name", "Email", "Mobile",
  "Type", "Stage", "Source", "Background", "UTM Source", "UTM Campaign", "Assigned to",
];

export async function GET(req: NextRequest) {
  try {
    await requireStaff("COUNSELOR");
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Staff authentication unavailable" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const status = sp.get("status");
  const source = sp.get("source");
  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv";

  const where: Prisma.LeadWhereInput = {};
  if (status && (Object.values(LeadStatus) as string[]).includes(status)) where.status = status as LeadStatus;
  if (source && (Object.values(LeadSource) as string[]).includes(source)) where.source = source as LeadSource;
  if (q) {
    where.OR = [
      { full_name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q } },
    ];
  }

  const leads = await db.lead.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: { assigned_to: { select: { name: true } } },
  });

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);

  const rows = leads.map((l) => [
    leadCode(l.id),
    fmtDate(l.created_at),
    l.full_name,
    l.email,
    l.mobile ?? "",
    l.form_type,
    STATUS_LABELS[l.status],
    SOURCE_LABELS[l.source],
    l.background ?? "",
    l.utm_source ?? "",
    l.utm_campaign ?? "",
    l.assigned_to?.name ?? "",
  ]);

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Leads");
    ws.addRows([HEADERS, ...rows.map((row) => row.map(safeSpreadsheetCell))]);
    ws.columns.forEach((column, i) => {
      column.width = Math.min(40, rows.reduce((width, row) => Math.max(width, String(row[i] ?? "").length), HEADERS[i].length) + 2);
    });
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="medskills-leads-${stamp}.xlsx"`,
      },
    });
  }

  // CSV (with BOM so Excel opens UTF-8 correctly)
  const esc = (v: unknown) => {
    const s = safeSpreadsheetCell(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = "﻿" + [HEADERS, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="medskills-leads-${stamp}.csv"`,
    },
  });
}
