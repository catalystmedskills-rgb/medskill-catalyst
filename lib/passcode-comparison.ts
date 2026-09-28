import { timingSafeEqual } from "node:crypto";

// Used by both App Router server modules and Pages Router API routes.
export function passcodesMatch(
  given: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
