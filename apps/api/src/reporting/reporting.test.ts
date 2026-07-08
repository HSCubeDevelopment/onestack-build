import { describe, expect, it } from 'vitest';
import { bookedMinutes, daysInPeriod, turnaround, utilisation } from './reporting';

const DAY = 86_400_000;

describe('daysInPeriod', () => {
  it('counts calendar days, minimum 1', () => {
    const from = new Date('2026-06-01T00:00:00Z');
    expect(daysInPeriod(from, new Date('2026-06-31T00:00:00Z'))).toBe(30);
    expect(daysInPeriod(from, from)).toBe(1);
  });
});

describe('turnaround', () => {
  it('returns null average for no completed jobs', () => {
    const t = turnaround([]);
    expect(t.completedCount).toBe(0);
    expect(t.averageDays).toBeNull();
    expect(t.approximate).toBe(true);
  });

  it('averages days across completed jobs', () => {
    const base = new Date('2026-06-01T00:00:00Z');
    const t = turnaround([
      { createdAt: base, completedAt: new Date(base.getTime() + 2 * DAY) },
      { createdAt: base, completedAt: new Date(base.getTime() + 4 * DAY) },
    ]);
    expect(t.completedCount).toBe(2);
    expect(t.averageDays).toBe(3);
  });

  it('never goes negative for out-of-order timestamps', () => {
    const base = new Date('2026-06-10T00:00:00Z');
    const t = turnaround([{ createdAt: base, completedAt: new Date(base.getTime() - DAY) }]);
    expect(t.averageDays).toBe(0);
  });
});

describe('utilisation', () => {
  it('computes booked vs capacity and caps at 100%', () => {
    // 2 resources × 8h × 5 days = 80h capacity; 40h booked → 50%
    const u = utilisation({ bookedMinutes: 40 * 60, resourceCount: 2, periodDays: 5, hoursPerDay: 8 });
    expect(u.bookedHours).toBe(40);
    expect(u.capacityHours).toBe(80);
    expect(u.utilisationPct).toBe(50);

    const over = utilisation({ bookedMinutes: 1000 * 60, resourceCount: 1, periodDays: 1, hoursPerDay: 8 });
    expect(over.utilisationPct).toBe(100);
  });

  it('is 0% when there are no resources', () => {
    expect(utilisation({ bookedMinutes: 120, resourceCount: 0, periodDays: 5, hoursPerDay: 8 }).utilisationPct).toBe(
      0,
    );
  });
});

describe('bookedMinutes', () => {
  it('sums durations clipped to the period', () => {
    const from = new Date('2026-06-01T00:00:00Z');
    const to = new Date('2026-06-02T00:00:00Z');
    const mins = bookedMinutes(
      [
        { startsAt: new Date('2026-06-01T09:00:00Z'), endsAt: new Date('2026-06-01T11:00:00Z') }, // 120
        { startsAt: new Date('2026-05-31T23:00:00Z'), endsAt: new Date('2026-06-01T01:00:00Z') }, // clipped → 60
        { startsAt: new Date('2026-06-05T09:00:00Z'), endsAt: new Date('2026-06-05T10:00:00Z') }, // outside → 0
      ],
      from,
      to,
    );
    expect(mins).toBe(180);
  });
});
