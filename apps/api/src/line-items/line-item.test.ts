import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeLine, LineItemInput, summarize } from './line-item';

const base = { description: 'x', type: 'product' as const };

describe('Line Item money core — golden values', () => {
  it('GST inclusive: qty 2 × 1100 → net 2000, gst 200, total 2200', () => {
    expect(
      computeLine({
        ...base,
        quantity: 2,
        unitPriceCents: 1100,
        taxCode: 'GST',
        taxTreatment: 'inclusive',
      }),
    ).toMatchObject({ netCents: 2000, gstCents: 200, totalCents: 2200 });
  });

  it('GST exclusive: qty 2 × 1000 → net 2000, gst 200, total 2200', () => {
    expect(
      computeLine({
        ...base,
        quantity: 2,
        unitPriceCents: 1000,
        taxCode: 'GST',
        taxTreatment: 'exclusive',
      }),
    ).toMatchObject({ netCents: 2000, gstCents: 200, totalCents: 2200 });
  });

  it('GST_FREE: qty 3 × 500 → net 1500, gst 0, total 1500', () => {
    expect(
      computeLine({
        ...base,
        quantity: 3,
        unitPriceCents: 500,
        taxCode: 'GST_FREE',
        taxTreatment: 'exclusive',
      }),
    ).toMatchObject({ netCents: 1500, gstCents: 0, totalCents: 1500 });
  });

  it('rounds at the cent (inclusive 100 → 91/9; exclusive 95 → 95/10/105)', () => {
    expect(
      computeLine({
        ...base,
        quantity: 1,
        unitPriceCents: 100,
        taxCode: 'GST',
        taxTreatment: 'inclusive',
      }),
    ).toMatchObject({ netCents: 91, gstCents: 9, totalCents: 100 });
    expect(
      computeLine({
        ...base,
        quantity: 1,
        unitPriceCents: 95,
        taxCode: 'GST',
        taxTreatment: 'exclusive',
      }),
    ).toMatchObject({ netCents: 95, gstCents: 10, totalCents: 105 });
  });

  it('zero quantity is all zeros; negatives are rejected', () => {
    expect(
      computeLine({
        ...base,
        quantity: 0,
        unitPriceCents: 999,
        taxCode: 'GST',
        taxTreatment: 'inclusive',
      }),
    ).toMatchObject({ netCents: 0, gstCents: 0, totalCents: 0 });
    expect(() =>
      computeLine({
        ...base,
        quantity: -1,
        unitPriceCents: 100,
        taxCode: 'GST',
        taxTreatment: 'inclusive',
      }),
    ).toThrow();
    expect(() =>
      computeLine({
        ...base,
        quantity: 1,
        unitPriceCents: -100,
        taxCode: 'GST',
        taxTreatment: 'inclusive',
      }),
    ).toThrow();
  });

  it('the SAME lines total identically for a quote and an invoice', () => {
    const lines: LineItemInput[] = [
      { ...base, quantity: 2, unitPriceCents: 5000, taxCode: 'GST', taxTreatment: 'exclusive' },
      { ...base, quantity: 1, unitPriceCents: 3300, taxCode: 'GST', taxTreatment: 'inclusive' },
      { ...base, quantity: 4, unitPriceCents: 250, taxCode: 'GST_FREE', taxTreatment: 'exclusive' },
    ];
    const quoteTotals = summarize(lines.map(computeLine));
    const invoiceTotals = summarize(lines.map(computeLine));
    expect(quoteTotals).toEqual(invoiceTotals);
    // sum(net) + sum(gst) === sum(total)
    expect(quoteTotals.netCents + quoteTotals.gstCents).toBe(quoteTotals.totalCents);
  });
});

describe('Line Item money core — properties', () => {
  it('every line: net + gst === total, gst >= 0', () => {
    fc.assert(
      fc.property(
        fc.record({
          quantity: fc.integer({ min: 0, max: 100_000 }),
          unitPriceCents: fc.integer({ min: 0, max: 10_000_000 }),
          taxCode: fc.constantFrom('GST' as const, 'GST_FREE' as const),
          taxTreatment: fc.constantFrom('inclusive' as const, 'exclusive' as const),
        }),
        (r) => {
          const line = computeLine({ ...base, ...r });
          expect(line.netCents + line.gstCents).toBe(line.totalCents);
          expect(line.gstCents).toBeGreaterThanOrEqual(0);
          expect(line.netCents).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('summing lines preserves net + gst === total', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            quantity: fc.integer({ min: 0, max: 1000 }),
            unitPriceCents: fc.integer({ min: 0, max: 1_000_000 }),
            taxCode: fc.constantFrom('GST' as const, 'GST_FREE' as const),
            taxTreatment: fc.constantFrom('inclusive' as const, 'exclusive' as const),
          }),
          { maxLength: 20 },
        ),
        (rows) => {
          const totals = summarize(rows.map((r) => computeLine({ ...base, ...r })));
          expect(totals.netCents + totals.gstCents).toBe(totals.totalCents);
        },
      ),
    );
  });
});
