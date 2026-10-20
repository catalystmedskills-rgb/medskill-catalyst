import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readMasterclassConfig, holdEnabled, pricingAt } from "@/src/modules/masterclass/config";
import { HOLD_COOKIE, HOLD_COOKIE_MAX_AGE_SECONDS, createHoldValue, readHoldValue } from "@/src/modules/masterclass/hold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start (or report) this visitor's personal free hold. Idempotent: an existing
 * valid hold is returned unchanged, so a refresh never restarts the clock.
 */
export async function POST() {
  const config = readMasterclassConfig();
  const headers = { "Cache-Control": "no-store" };
  if (!holdEnabled(config)) return NextResponse.json({ holdEndsAt: null }, { headers });

  const now = new Date();
  const jar = await cookies();
  let start = readHoldValue(jar.get(HOLD_COOKIE)?.value, config.holdSecret!, now);
  if (!start) {
    start = now;
    jar.set(HOLD_COOKIE, createHoldValue(start, config.holdSecret!), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: HOLD_COOKIE_MAX_AGE_SECONDS,
    });
  }
  const pricing = pricingAt(config, now, start);
  return NextResponse.json({ holdEndsAt: pricing.holdEndsAt?.toISOString() ?? null, phase: pricing.phase }, { headers });
}
