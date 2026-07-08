/**
 * Reporting & dashboards — pure logic (Phase 3, card #145). GENERIC core: revenue, jobs, turnaround and
 * utilisation over a period. No I/O — the service assembles the inputs from existing services and calls
 * these. Deterministic and read-only; owns nothing.
 */

const DAY_MS = 1000 * 60 * 60 * 24;
const MIN_MS = 1000 * 60;

/** Whole calendar days spanned by [from, to] (at least 1). */
export function daysInPeriod(from: Date, to: Date): number {
  const d = Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
  return Math.max(1, d);
}

export interface TurnaroundInput {
  createdAt: Date;
  /** When the job reached a final state (approximated by its last update while in that state). */
  completedAt: Date;
}

export interface TurnaroundStats {
  completedCount: number;
  averageDays: number | null;
  /** Turnaround is approximate — derived from the last-updated time of jobs now in a final state. */
  approximate: true;
}

/** Average turnaround (days) across completed jobs. Null when there are none. */
export function turnaround(inputs: TurnaroundInput[]): TurnaroundStats {
  if (inputs.length === 0) return { completedCount: 0, averageDays: null, approximate: true };
  let total = 0;
  for (const i of inputs) {
    total += Math.max(0, i.completedAt.getTime() - i.createdAt.getTime());
  }
  const averageDays = Math.round((total / inputs.length / DAY_MS) * 10) / 10;
  return { completedCount: inputs.length, averageDays, approximate: true };
}

export interface UtilisationInput {
  bookedMinutes: number;
  resourceCount: number;
  periodDays: number;
  /** Assumed working hours per resource per day. */
  hoursPerDay: number;
}

export interface UtilisationStats {
  resourceCount: number;
  bookedHours: number;
  capacityHours: number;
  utilisationPct: number;
  /** Capacity assumes `hoursPerDay` working hours per resource across every calendar day in the period. */
  hoursPerDay: number;
}

/** Booked hours vs an assumed capacity (resources × hours/day × days). Capped at 100%. */
export function utilisation(input: UtilisationInput): UtilisationStats {
  const bookedHours = Math.round((input.bookedMinutes / 60) * 10) / 10;
  const capacityHours = input.resourceCount * input.hoursPerDay * input.periodDays;
  const utilisationPct =
    capacityHours > 0 ? Math.min(100, Math.round((bookedHours / capacityHours) * 1000) / 10) : 0;
  return {
    resourceCount: input.resourceCount,
    bookedHours,
    capacityHours,
    utilisationPct,
    hoursPerDay: input.hoursPerDay,
  };
}

/** Sum of booking durations (minutes) that overlap the period. */
export function bookedMinutes(
  bookings: Array<{ startsAt: Date; endsAt: Date }>,
  from: Date,
  to: Date,
): number {
  let total = 0;
  for (const b of bookings) {
    const start = Math.max(b.startsAt.getTime(), from.getTime());
    const end = Math.min(b.endsAt.getTime(), to.getTime());
    if (end > start) total += (end - start) / MIN_MS;
  }
  return Math.round(total);
}
