import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processDueConfirmations } from "@/src/modules/masterclass/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Durable retry for masterclass confirmation emails. Vercel Cron calls this
 * with `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processDueConfirmations(50);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] masterclass email sweep failed:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
