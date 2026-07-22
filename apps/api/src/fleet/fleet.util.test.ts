import { describe, expect, it } from 'vitest';
import { endOfToday, isFleetVehicleStatus, normPhone, normRego, startOfToday } from './fleet.util';

describe('fleet.util', () => {
  it('normRego uppercases and strips non-alphanumerics', () => {
    expect(normRego('1pi3xz ')).toBe('1PI3XZ');
    expect(normRego(' abc-123 ')).toBe('ABC123');
    expect(normRego(null)).toBe('');
    expect(normRego(undefined)).toBe('');
  });

  it('normPhone keeps digits and normalises AU mobile forms', () => {
    expect(normPhone('0400 000 000')).toBe('0400000000');
    expect(normPhone('+61 400 000 000')).toBe('0400000000'); // 61… -> 0…
    expect(normPhone('400000000')).toBe('0400000000'); // bare 9-digit 4… -> 0…
    expect(normPhone('(03) 9000 1234')).toBe('0390001234');
    expect(normPhone('')).toBe('');
  });

  it('isFleetVehicleStatus guards the status union', () => {
    expect(isFleetVehicleStatus('available')).toBe(true);
    expect(isFleetVehicleStatus('out')).toBe(true);
    expect(isFleetVehicleStatus('nonsense')).toBe(false);
  });

  it('startOfToday/endOfToday bound the Melbourne calendar day (not UTC)', () => {
    // 03:00Z on 15 Jul is 13:00 in Melbourne (AEST, UTC+10) → the Melbourne day is the 15th.
    const now = new Date('2026-07-15T03:00:00Z');
    const s = startOfToday(now);
    const e = endOfToday(now);
    const wall = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Melbourne',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(d)
        .reduce<Record<string, string>>((a, x) => {
          if (x.type !== 'literal') a[x.type] = x.value;
          return a;
        }, {});
    const ws = wall(s);
    expect(`${ws.year}-${ws.month}-${ws.day} ${ws.hour}:${ws.minute}`).toBe('2026-07-15 00:00');
    // Melbourne midnight on 15 Jul (AEST) is 14:00Z on the 14th.
    expect(s.toISOString()).toBe('2026-07-14T14:00:00.000Z');
    expect(s.getTime()).toBeLessThan(e.getTime());
    const span = e.getTime() - s.getTime();
    expect(span).toBeGreaterThan(23 * 3600 * 1000);
    expect(span).toBeLessThan(24 * 3600 * 1000);
  });
});
