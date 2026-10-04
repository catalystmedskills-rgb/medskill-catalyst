import { toISODate } from "./dates";

/**
 * The duplicate rule (decision 2026-09-25):
 *   one live credential per learner + program + cohort,
 *   or learner + program + completion context when there is no cohort.
 *
 * The key is enforced by a partial unique index over ISSUING/VALID rows
 * (credentials_dedupe_active_key). The "v1:" prefix versions the rule: a
 * future rule writes "v2:" keys for new rows without touching old ones, so the
 * rule can evolve with no destructive schema change.
 *
 * Completion context when there is no cohort = the completion date. Two
 * cohort-less completions of the same program on different dates are treated as
 * distinct completions; the same date is a duplicate.
 */
export function dedupeKey(opts: {
  studentId: string;
  courseId: string;
  batchId: string | null;
  completionDate: Date;
  /**
   * A credential type's own identity, when it has one (internships: title +
   * start + end, see credential-types.ts). It replaces the cohort/date context,
   * so one learner can hold two different internships from the same program.
   */
  typeContext?: string | null;
}): string {
  const context = opts.typeContext
    ? opts.typeContext
    : opts.batchId
      ? `b:${opts.batchId}`
      : `c:${toISODate(opts.completionDate)}`;
  return `v1:${opts.studentId}:${opts.courseId}:${context}`;
}

export function completionContext(batchId: string | null, completionDate: Date): string | null {
  return batchId ? null : toISODate(completionDate);
}
