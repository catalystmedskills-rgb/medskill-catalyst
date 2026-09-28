import type { NextApiRequest, NextApiResponse } from "next";
import { passcodesMatch } from "@/lib/passcode-comparison";
import { adminAuthMode } from "@/src/lib/auth-mode";
import { safeSpreadsheetCell } from "@/src/lib/spreadsheet-export";

/**
 * Read-only leads feed for the admin dashboard.
 * Mirror of the framework-agnostic root function at /api/leads.js —
 * keep the two in sync.
 *
 * Auth: ADMIN_PASSCODE env var, sent via the "x-admin-passcode" header only.
 * Header-only (never the URL query string, which would leak the passcode into
 * logs/history) and compared in constant time — see lib/admin-auth.ts.
 */

const COLUMNS = [
  "id", "created_at", "full_name", "email", "mobile",
  "form_type", "background", "consent",
  "utm_source", "utm_medium", "utm_campaign", "landing_page",
] as const;

function csvEscape(v: unknown): string {
  const s = safeSpreadsheetCell(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (adminAuthMode() === "clerk") {
    return res.status(410).json({ error: "Use the authenticated CRM leads page and export." });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    console.error("[Leads] ADMIN_PASSCODE env var is not set.");
    return res.status(500).json({ error: "Dashboard is not configured." });
  }
  const headerVal = req.headers["x-admin-passcode"];
  const given = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!passcodesMatch(given, expected)) {
    return res.status(401).json({ error: "Invalid passcode." });
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: "Lead storage is not configured." });
  }

  try {
    const r = await fetch(
      url + "/rest/v1/leads?select=*&order=created_at.desc&limit=10000",
      { headers: { apikey: key, Authorization: "Bearer " + key } }
    );
    if (!r.ok) {
      console.error("[Leads] Supabase read failed (" + r.status + "): " + (await r.text()).slice(0, 300));
      return res.status(502).json({ error: "Could not load leads." });
    }
    const leads: Record<string, unknown>[] = await r.json();

    if (req.query.format === "csv") {
      const header = COLUMNS.join(",");
      const rows = leads.map((l) => COLUMNS.map((c) => csvEscape(l[c])).join(","));
      const csv = "﻿" + [header, ...rows].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="medskills-leads-' + new Date().toISOString().slice(0, 10) + '.csv"'
      );
      return res.status(200).send(csv);
    }

    return res.status(200).json(leads);
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
