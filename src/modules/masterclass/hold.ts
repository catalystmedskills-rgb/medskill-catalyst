import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Personal free-registration hold.
 *
 * When a visitor first lands on the page the server starts a hold and stores
 * its start time in a signed, HttpOnly cookie. Refreshing or returning in the
 * same browser keeps the same start time, and the price is decided on the
 * server from this cookie — the countdown on the page only displays it.
 *
 * Cookie value: "<startMs>.<hex hmac-sha256(startMs)>".
 */

export const HOLD_COOKIE = "msc_mc_hold";
/** Cookie lifetime; long enough to outlast the event so a hold can't be restarted by expiry. */
export const HOLD_COOKIE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function sign(startMs: number, secret: string): string {
  return createHmac("sha256", secret).update(`mc-hold-v1:${startMs}`).digest("hex");
}

export function createHoldValue(start: Date, secret: string): string {
  const ms = start.getTime();
  return `${ms}.${sign(ms, secret)}`;
}

/** The hold's start time, or null when the cookie is absent, malformed, forged or from the future. */
export function readHoldValue(value: string | undefined | null, secret: string, now: Date = new Date()): Date | null {
  if (!value) return null;
  const m = /^(\d{12,14})\.([a-f0-9]{64})$/.exec(value);
  if (!m) return null;
  const ms = Number(m[1]);
  const expected = Buffer.from(sign(ms, secret), "hex");
  const given = Buffer.from(m[2], "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  // Allow a minute of clock skew between server instances; reject anything later.
  if (ms > now.getTime() + 60_000) return null;
  return new Date(ms);
}

/** Pull one cookie out of a Cookie header. */
export function cookieFromHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
