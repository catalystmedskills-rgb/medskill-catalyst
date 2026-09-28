import { NextResponse } from "next/server";
import { adminAuthMode } from "@/src/lib/auth-mode";
import { denyLegacyClerkAuth } from "@/src/lib/legacy-clerk-auth";
import { getServiceClient } from "@/lib/supabase";
import {
  ADMIN_NOT_CONFIGURED_MESSAGE,
  adminPasscodeConfigured,
  hasAdminPasscode,
} from "@/lib/admin-auth";
import {
  checkAdminAuthRateLimit,
  clearAdminAuthFailures,
  clientKey,
  rateLimitMessage,
  recordAdminAuthFailure,
} from "@/src/lib/rate-limit";
import { createInvoice, InvoiceError } from "@/src/lib/invoices";

export const runtime = "nodejs";

// Invoicing API (Phase 1) — CRM-integrated invoice creation + listing.
// Auth: ADMIN_PASSCODE via the "x-admin-passcode" header only (header-only,
// constant-time — see lib/admin-auth.ts). All money is computed server-side by
// createInvoice() (src/lib/invoices.ts) — the client never sets subtotal/tax/
// total, and the invoice number is issued atomically in Postgres.

// Deny with 503 when the deployment has no ADMIN_PASSCODE at all, and 401
// only when it has one and the caller got it wrong. Collapsing both into a
// 401 makes a misconfigured deployment indistinguishable from a bad passcode.
async function denyAuth(request: Request): Promise<NextResponse | null> {
  if (adminAuthMode() === "clerk") return denyLegacyClerkAuth(request, "ACCOUNTS");
  if (!adminPasscodeConfigured()) {
    return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  // Throttle before checking the passcode, so an exhausted caller cannot keep
  // guessing. Answered in process: an accepted request never reaches Postgres,
  // which these Supabase-only routes otherwise have no reason to touch.
  const key = clientKey(request.headers, "invoices");
  const limit = checkAdminAuthRateLimit(key);
  if (limit.blocked) {
    return NextResponse.json(
      { error: rateLimitMessage(limit.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!hasAdminPasscode(request.headers.get("x-admin-passcode"))) {
    await recordAdminAuthFailure(key);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (limit.hadFailures) await clearAdminAuthFailures(key);
  return null;
}

type ItemIn = { description?: unknown; hsn?: unknown; quantity?: unknown; rate?: unknown };

export async function GET(request: Request) {
  const denied = await denyAuth(request);
  if (denied) return denied;
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Invoices] list error:", error);
      return NextResponse.json({ error: "Failed to load invoices." }, { status: 502 });
    }
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[Invoices] GET failure:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await denyAuth(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? (body.items as ItemIn[]) : [];
  const leadId =
    body.lead_id === undefined || body.lead_id === null || body.lead_id === ""
      ? null
      : Number(body.lead_id);

  try {
    const inv = await createInvoice({
      bill_name: String(body.bill_name || ""),
      bill_email: body.bill_email as string | undefined,
      bill_phone: body.bill_phone as string | undefined,
      bill_company: body.bill_company as string | undefined,
      bill_gstin: body.bill_gstin as string | undefined,
      bill_address: body.bill_address as string | undefined,
      bill_state: body.bill_state as string | undefined,
      lead_id: leadId,
      items: rawItems.map((it) => ({
        description: String(it.description ?? ""),
        hsn: (it.hsn as string | undefined) ?? null,
        quantity: Number(it.quantity) || 0,
        rate: Number(it.rate) || 0,
      })),
      tax_rate: body.tax_rate === undefined ? undefined : Number(body.tax_rate),
      currency: body.currency as string | undefined,
      issue_date: body.issue_date as string | undefined,
      due_date: body.due_date as string | undefined,
      notes: body.notes as string | undefined,
      seller_gstin: body.seller_gstin as string | undefined,
      place_of_supply: body.place_of_supply as string | undefined,
      status: "draft",
    });

    return NextResponse.json(inv, { status: 201 });
  } catch (err) {
    if (err instanceof InvoiceError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[Invoices] POST failure:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
