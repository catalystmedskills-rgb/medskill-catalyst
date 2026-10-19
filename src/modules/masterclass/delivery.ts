/**
 * Retry policy for the masterclass confirmation email. Pure, so the schedule
 * is unit-tested rather than discovered in production.
 */

/** Total send attempts before a registration is left FAILED for a human. */
export const MAX_EMAIL_ATTEMPTS = 6;

/** A SENDING claim older than this is assumed dead (crashed worker) and reclaimable. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

// Delay before attempt N+1, indexed by attempts already made (1-based).
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000];

/**
 * When to try again after `attempts` failed sends, or null when the
 * registration should stop retrying (attempts exhausted or a permanent error).
 */
export function nextAttemptAt(attempts: number, permanent: boolean, now = new Date()): Date | null {
  if (permanent || attempts >= MAX_EMAIL_ATTEMPTS) return null;
  const delay = BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1];
  return new Date(now.getTime() + delay);
}

/**
 * Resend rejects some requests for reasons a retry can never fix — a malformed
 * recipient address is the common one. Everything else (rate limits, 5xx,
 * network errors, a missing key that an operator can add) is worth retrying.
 */
export function isPermanentEmailFailure(reason: string | undefined): boolean {
  if (!reason) return false;
  return /^resend_(400|422):/.test(reason);
}
