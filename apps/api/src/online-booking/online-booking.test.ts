// Unit tests for the pure online-booking slot logic (Phase 3). No DB, no wall clock (now is injected).
import { describe, expect, it } from 'vitest';
import { resolveSlot, validateSlotMinutes } from './online-booking';

const fail = (m: string) => new Error(m);
const NOW = Date.parse('2026-07-08T09:00:00.000Z');

describe('validateSlotMinutes', () => {
  it('accepts an in-range integer', () => {
    expect(validateSlotMinutes(60, fail)).toBe(60);
  });
  it('rejects non-integers and out-of-range values', () => {
    expect(() => validateSlotMinutes(0, fail)).toThrow(/between/i);
    expect(() => validateSlotMinutes(600, fail)).toThrow(/between/i);
    expect(() => validateSlotMinutes(30.5, fail)).toThrow(/between/i);
    expect(() => validateSlotMinutes('60' as unknown, fail)).toThrow(/between/i);
  });
});

describe('resolveSlot', () => {
  it('derives the end from the slot length for a future start', () => {
    const { startsAt, endsAt } = resolveSlot('2026-07-08T10:00:00.000Z', 90, NOW, fail);
    expect(startsAt.toISOString()).toBe('2026-07-08T10:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-07-08T11:30:00.000Z');
  });
  it('rejects an invalid or past start', () => {
    expect(() => resolveSlot('not-a-date', 60, NOW, fail)).toThrow(/valid date/i);
    expect(() => resolveSlot('2026-07-08T08:00:00.000Z', 60, NOW, fail)).toThrow(/future/i);
  });
});
