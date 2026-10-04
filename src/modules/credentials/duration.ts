import { addMonths } from "./dates";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CalendarDuration = {
  /** Inclusive calendar days, start and end both counted. */
  days: number;
  /** Whole calendar months from the start date. */
  months: number;
  /** Days left over after the whole months. */
  remainderDays: number;
  /** What the certificate prints, e.g. "3 Months", "4 Weeks", "2 Months 15 Days". */
  label: string;
};

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * The calendar duration of an inclusive date range (owner rule, 2026-10-04):
 *
 *   whole months            → "3 Months"          (1 Jun – 31 Aug)
 *   under a month, whole wk → "4 Weeks"           (1 Jun – 28 Jun)
 *   otherwise               → "2 Months 15 Days"  (1 Jun – 15 Aug), or "10 Days"
 *
 * Exact, never rounded, so the printed duration always agrees with the printed
 * dates. The start and end dates are the source of truth; nobody types this.
 * Working hours are a separate, optional figure and are never inferred here.
 *
 * Months are counted from the start date each time (not chained), with the
 * month-end clamp of addMonths: 31 Jan – 27 Feb is "1 Month".
 */
export function calendarDuration(start: Date, end: Date): CalendarDuration {
  if (end.getTime() < start.getTime()) throw new RangeError("The end date is before the start date.");
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const dayAfterEnd = new Date(end.getTime() + DAY_MS);

  let months = 0;
  while (addMonths(start, months + 1).getTime() <= dayAfterEnd.getTime()) months++;
  const remainderDays = Math.round((dayAfterEnd.getTime() - addMonths(start, months).getTime()) / DAY_MS);

  let label: string;
  if (months > 0 && remainderDays === 0) label = plural(months, "Month");
  else if (months > 0) label = `${plural(months, "Month")} ${plural(remainderDays, "Day")}`;
  else if (days % 7 === 0) label = plural(days / 7, "Week");
  else label = plural(days, "Day");

  return { days, months, remainderDays, label };
}
