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

export const runtime = "nodejs";

// Single-invoice read + workflow updates (status / notes / dates).
// Money and line items are immutable here — re-issue a new invoice instead.
// Auth: header-only, constant-time (see lib/admin-auth.ts).

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

const ALLOWED_STATUS = ["draft", "sent", "viewed", "paid", "overdue", "cancelled"];

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await denyAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Invoices] GET one failure:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await denyAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!ALLOWED_STATUS.includes(s)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    update.status = s;
  }
  if (body.notes !== undefined) update.notes = String(body.notes || "").trim() || null;
  if (body.due_date !== undefined) update.due_date = String(body.due_date || "").trim() || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("invoices")
      .update(update)
      .eq("id", id)
      .select("*, invoice_items(*)")
      .single();

    if (error || !data) {
      console.error("[Invoices] update error:", error);
      return NextResponse.json({ error: "Failed to update invoice." }, { status: 502 });
    }
    return NextResponse.json({ success: true, invoice: data });
  } catch (err) {
    console.error("[Invoices] PATCH failure:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
