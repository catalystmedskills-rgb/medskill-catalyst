import { NextResponse } from "next/server";
import { adminAuthMode } from "@/src/lib/auth-mode";
import { denyLegacyClerkAuth } from "@/src/lib/legacy-clerk-auth";
import { getServiceClient, signCareersFile } from "@/lib/supabase";
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

// Header-only, constant-time passcode check (see lib/admin-auth.ts).
// Deny with 503 when the deployment has no ADMIN_PASSCODE at all, and 401
// only when it has one and the caller got it wrong. Collapsing both into a
// 401 makes a misconfigured deployment indistinguishable from a bad passcode.
async function denyAuth(request: Request): Promise<NextResponse | null> {
  if (adminAuthMode() === "clerk") return denyLegacyClerkAuth(request, "COUNSELOR");
  if (!adminPasscodeConfigured()) {
    return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  // Throttle before checking the passcode, so an exhausted caller cannot keep
  // guessing. Answered in process: an accepted request never reaches Postgres,
  // which these Supabase-only routes otherwise have no reason to touch.
  const key = clientKey(request.headers, "careers-admin");
  const limit = checkAdminAuthRateLimit(key);
  if (limit.blocked) {
    return NextResponse.json(
      { error: rateLimitMessage(limit.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!hasAdminPasscode(request.headers.get("x-admin-passcode"))) {
    await recordAdminAuthFailure(key);
    return NextResponse.json({ error: "Invalid passcode or unauthorized access." }, { status: 401 });
  }
  if (limit.hadFailures) await clearAdminAuthFailures(key);
  return null;
}

// Applicant file columns hold private object paths; sign them for the admin.
const FILE_FIELDS = ["resume_url", "certificates_url", "portfolio_url", "achievements_url"] as const;

async function withSignedFileUrls(
  supabase: ReturnType<typeof getServiceClient>,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  return Promise.all(
    rows.map(async (row) => {
      const out = { ...row };
      for (const f of FILE_FIELDS) {
        const v = row[f];
        if (typeof v === "string" && v) {
          out[f] = await signCareersFile(supabase, v);
        }
      }
      return out;
    }),
  );
}

export async function GET(request: Request) {
  const denied = await denyAuth(request);
  if (denied) return denied;

  try {
    const supabase = getServiceClient();
    
    // Fetch all applications sorted by submission date
    const { data, error } = await supabase
      .from("career_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Careers Admin] Supabase query error:", error);
      return NextResponse.json({ error: "Failed to retrieve applications." }, { status: 502 });
    }

    const signed = await withSignedFileUrls(supabase, data ?? []);
    return NextResponse.json(signed);
  } catch (err) {
    console.error("[Careers Admin] GET critical failure:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await denyAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id, status, internal_notes, reviewer } = body;

    if (!id) {
      return NextResponse.json({ error: "Application database ID is required." }, { status: 400 });
    }

    const supabase = getServiceClient();
    
    // Prepare dynamic update columns
    const updatePayload: Record<string, any> = {};
    if (status !== undefined) updatePayload.status = status;
    if (internal_notes !== undefined) updatePayload.internal_notes = internal_notes;
    if (reviewer !== undefined) updatePayload.reviewer = reviewer;

    const { data, error } = await supabase
      .from("career_applications")
      .update(updatePayload)
      .eq("id", id)
      .select();

    if (error) {
      console.error("[Careers Admin] Supabase update error:", error);
      return NextResponse.json({ error: "Failed to update database record." }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: data[0] });
  } catch (err) {
    console.error("[Careers Admin] PATCH critical failure:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
