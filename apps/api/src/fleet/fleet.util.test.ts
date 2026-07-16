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

  it('startOfToday/endOfToday bound the same calendar day', () => {
    const now = new Date('2026-07-15T13:45:00');
    const s = startOfToday(now);
    const e = endOfToday(now);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(e.getHours()).toBe(23);
    expect(e.getMinutes()).toBe(59);
    expect(s.getTime()).toBeLessThan(e.getTime());
    expect(e.getTime() - s.getTime()).toBeLessThan(24 * 3600 * 1000);
  });
});
