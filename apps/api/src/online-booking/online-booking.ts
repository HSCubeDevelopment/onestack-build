/**
 * Pure online-booking logic (Phase 3). No DB, no clock of its own — cheap to unit test. Validates a
 * requested slot (a valid, future start + a sane slot length) and computes its end.
 */

export const MIN_SLOT_MINUTES = 5;
export const MAX_SLOT_MINUTES = 8 * 60;

export function validateSlotMinutes(n: unknown, fail: (msg: string) => Error): number {
  if (
    typeof n !== 'number' ||
    !Number.isInteger(n) ||
    n < MIN_SLOT_MINUTES ||
    n > MAX_SLOT_MINUTES
  ) {
    throw fail(
      `slotMinutes must be an integer between ${MIN_SLOT_MINUTES} and ${MAX_SLOT_MINUTES}`,
    );
  }
  return n;
}

export interface ResolvedSlot {
  startsAt: Date;
  endsAt: Date;
}

/** Validate a requested start (ISO, in the future) and derive the end from the slot length. */
export function resolveSlot(
  startsAtISO: string,
  slotMinutes: number,
  nowMs: number,
  fail: (msg: string) => Error,
): ResolvedSlot {
  const start = new Date(startsAtISO);
  if (Number.isNaN(start.getTime())) throw fail('startsAt is not a valid date/time');
  if (start.getTime() <= nowMs) throw fail('startsAt must be in the future');
  const endsAt = new Date(start.getTime() + slotMinutes * 60_000);
  return { startsAt: start, endsAt };
}
