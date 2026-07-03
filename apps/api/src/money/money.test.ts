import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { gstFromInclusive, gstFromNet, roundHalfUp } from './money';

describe('GST money — golden values', () => {
  it.each([
    [1100, 1000, 100], // clean 10%
    [100, 91, 9], // 100/11 = 9.09 → 9
    [110, 100, 10],
    [1, 1, 0], // 1/11 = 0.09 → 0
    [0, 0, 0],
    [9999, 9090, 909], // 9999/11 = 909.0
  ])('gstFromInclusive(%i) → net %i, gst %i', (total, net, gst) => {
    expect(gstFromInclusive(total)).toEqual({ net, gst, total });
  });

  it.each([
    [1000, 100, 1100],
    [91, 9, 100], // 91/10 = 9.1 → 9
    [95, 10, 105], // 95/10 = 9.5 → 10 (half-up)
    [0, 0, 0],
  ])('gstFromNet(%i) → gst %i, total %i', (net, gst, total) => {
    expect(gstFromNet(net)).toEqual({ net, gst, total });
  });

  it('rounds half-up', () => {
    expect(roundHalfUp(9.5)).toBe(10);
    expect(roundHalfUp(9.49)).toBe(9);
    expect(roundHalfUp(0.5)).toBe(1);
  });

  it('rejects non-integer or negative cents', () => {
    expect(() => gstFromInclusive(10.5)).toThrow();
    expect(() => gstFromNet(-1)).toThrow();
  });
});

describe('GST money — properties', () => {
  it('inclusive split always reconstitutes the total', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (total) => {
        const b = gstFromInclusive(total);
        expect(b.net + b.gst).toBe(total);
        expect(b.net).toBeGreaterThanOrEqual(0);
        expect(b.gst).toBeGreaterThanOrEqual(0);
        // GST is within one cent of total/11.
        expect(Math.abs(b.gst - total / 11)).toBeLessThanOrEqual(0.5);
      }),
    );
  });

  it('net + gst is a valid inclusive total (round-trip stays within a cent)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (net) => {
        const b = gstFromNet(net);
        expect(b.total - b.gst).toBe(net);
        // Splitting the total we just built recovers a GST within one cent of the original.
        const back = gstFromInclusive(b.total);
        expect(Math.abs(back.gst - b.gst)).toBeLessThanOrEqual(1);
      }),
    );
  });
});
