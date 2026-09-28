import "server-only";
import { passcodesMatch } from "./passcode-comparison";
export { passcodesMatch } from "./passcode-comparison";

/**
 * Shared admin-passcode check for the passcode-gated API routes
 * (careers admin, invoices, legacy leads feed).
 *
 * Two deliberate properties:
 *  1. Constant-time comparison, so a response-timing side channel can't be used
 *     to recover the passcode character by character.
 *  2. Header-only. We do NOT read the passcode from the URL query string — a
 *     passcode in a URL ends up in server/CDN access logs, browser history and
 *     the Referer header. Callers must send it in the `x-admin-passcode` header.
 */

/** True when this deployment actually has a passcode to check against. */
export function adminPasscodeConfigured(): boolean {
  const v = process.env.ADMIN_PASSCODE;
  return typeof v === "string" && v.length > 0;
}

/**
 * Reported when ADMIN_PASSCODE is absent. Kept distinct from a 401 on purpose:
 * with no passcode configured, no input can ever succeed, so "invalid passcode"
 * points whoever is locked out at the wrong problem. A project moved to another
 * Vercel account (or re-created as a new project) is the usual way a deployment
 * ends up here — environment variables do not come along.
 */
export const ADMIN_NOT_CONFIGURED_MESSAGE =
  "Admin access is not configured on this deployment: ADMIN_PASSCODE is not set.";

/** True when the request carries the correct admin passcode in the header. */
export function hasAdminPasscode(headerValue: string | null | undefined): boolean {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    console.error("[admin-auth] ADMIN_PASSCODE is not configured.");
    return false;
  }
  return passcodesMatch(headerValue, expected);
}
