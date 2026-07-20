import { describe, expect, it } from 'vitest';
import { computeLines, summarize } from '../line-items/line-item';
import {
  EstimateLine,
  labourHoursByDiscipline,
  normaliseHours,
  priceLabour,
  priceSublet,
  RateCard,
  toLineItem,
  toLineItems,
} from './estimate';

const RATES: RateCard = { body: 9500, paint: 11000, mechanical: 13500 };

describe('priceLabour', () => {
  it('prices whole hours exactly', () => {
    expect(priceLabour(2, 9500)).toBe(19000);
  });

  it('survives the float trap that would lose a cent', () => {
    // 2.4 * 9500 is 22799.999999999996 in IEEE754. Naive rounding gives $227.99 — a cent short, on
    // every labour line, forever. Integer arithmetic gives the right answer.
    expect(priceLabour(2.4, 9500)).toBe(22800);
    expect(priceLabour(0.1 + 0.2, 10000)).toBe(3000); // 0.30000000000000004 h
  });

  it('rounds half-up at the cent, per money-rules §4', () => {
    // 0.005 h @ $1.00/h = 0.5c → 1c, not 0c.
    expect(priceLabour(0.01, 50)).toBe(1); // 0.5c rounds up
    expect(priceLabour(0.01, 49)).toBe(0); // 0.49c rounds down
  });

  it('prices zero hours as zero, not as a minimum charge', () => {
    expect(priceLabour(0, 9500)).toBe(0);
  });

  it('rejects negative hours and non-integer rates', () => {
    expect(() => priceLabour(-1, 9500)).toThrow(RangeError);
    expect(() => priceLabour(1, 95.5)).toThrow(RangeError);
  });
});

describe('normaliseHours', () => {
  it('keeps hundredths and discards false precision', () => {
    expect(normaliseHours(2.404)).toBe(2.4);
    expect(normaliseHours(2.45)).toBe(2.45);
  });

  it('rejects a nonsensical value rather than quietly pricing it', () => {
    expect(() => normaliseHours(Number.NaN)).toThrow(RangeError);
    expect(() => normaliseHours(-0.5)).toThrow(RangeError);
  });
});

describe('priceSublet', () => {
  it('adds the margin to cost', () => {
    expect(priceSublet(20000, 20)).toBe(24000);
  });

  it('treats zero margin as a legitimate pass-through', () => {
    expect(priceSublet(20000, 0)).toBe(20000);
  });

  it('rounds the margin half-up', () => {
    // 15% of 333c = 49.95c → 50c.
    expect(priceSublet(333, 15)).toBe(383);
  });
});

describe('toLineItem', () => {
  it('writes the estimator’s working into the description', () => {
    // The point of the card: generic lines "leak margin" because nobody can see the hours. Anyone
    // reading the quote can now check the arithmetic.
    const line = toLineItem(
      { kind: 'labour', discipline: 'body', description: 'Front bumper R&R', hours: 2.4 },
      RATES,
    );
    expect(line.description).toBe('Front bumper R&R — 2.4 h @ $95.00/h');
    expect(line.unitPriceCents).toBe(22800);
    expect(line.quantity).toBe(1);
    expect(line.type).toBe('labour');
  });

  it('uses the rate for the discipline, not one blended rate', () => {
    const body = toLineItem(
      { kind: 'labour', discipline: 'body', description: 'x', hours: 1 },
      RATES,
    );
    const paint = toLineItem(
      { kind: 'labour', discipline: 'paint', description: 'x', hours: 1 },
      RATES,
    );
    const mech = toLineItem(
      { kind: 'labour', discipline: 'mechanical', description: 'x', hours: 1 },
      RATES,
    );
    expect([body.unitPriceCents, paint.unitPriceCents, mech.unitPriceCents]).toEqual([
      9500, 11000, 13500,
    ]);
  });

  it('costs paint materials per paint hour', () => {
    const line = toLineItem(
      {
        kind: 'paint-materials',
        description: 'Paint & materials',
        paintHours: 3.5,
        ratePerHourCents: 4200,
      },
      RATES,
    );
    expect(line.unitPriceCents).toBe(14700);
    // 'product', not 'labour' — so a later margin report can separate materials from labour recovery.
    expect(line.type).toBe('product');
  });

  it('keeps a part as real quantity × unit price', () => {
    const line = toLineItem(
      { kind: 'part', description: 'Bumper bar', quantity: 2, unitPriceCents: 18500 },
      RATES,
    );
    expect({ q: line.quantity, u: line.unitPriceCents }).toEqual({ q: 2, u: 18500 });
  });

  it('marks a sublet and shows its margin', () => {
    const line = toLineItem(
      { kind: 'sublet', description: 'Windscreen', costCents: 30000, marginPercent: 20 },
      RATES,
    );
    expect(line.description).toBe('Windscreen (sublet, +20%)');
    expect(line.unitPriceCents).toBe(36000);
  });

  it('defaults to GST exclusive but lets a line override', () => {
    const def = toLineItem(
      { kind: 'part', description: 'x', quantity: 1, unitPriceCents: 100 },
      RATES,
    );
    expect({ c: def.taxCode, t: def.taxTreatment }).toEqual({ c: 'GST', t: 'exclusive' });

    const free = toLineItem(
      { kind: 'part', description: 'x', quantity: 1, unitPriceCents: 100, taxCode: 'GST_FREE' },
      RATES,
    );
    expect(free.taxCode).toBe('GST_FREE');
  });

  it('refuses to price a discipline with no configured rate', () => {
    // Better a loud failure than silently quoting labour at $0.
    expect(() =>
      toLineItem({ kind: 'labour', discipline: 'paint', description: 'x', hours: 1 }, {
        body: 9500,
      } as RateCard),
    ).toThrow(/no rate configured/);
  });
});

describe('the estimate feeds the existing money engine untouched', () => {
  const estimate: EstimateLine[] = [
    { kind: 'labour', discipline: 'body', description: 'Bumper R&R', hours: 2.4 },
    { kind: 'labour', discipline: 'paint', description: 'Bumper refinish', hours: 3 },
    {
      kind: 'paint-materials',
      description: 'Paint & materials',
      paintHours: 3,
      ratePerHourCents: 4200,
    },
    { kind: 'part', description: 'Bumper bar', quantity: 1, unitPriceCents: 18500 },
    { kind: 'sublet', description: 'Windscreen', costCents: 30000, marginPercent: 20 },
  ];

  it('produces one line per estimate item, in order', () => {
    const lines = toLineItems(estimate, RATES);
    expect(lines).toHaveLength(5);
    expect(lines[0]?.description).toMatch(/Bumper R&R/);
    expect(lines.at(-1)?.description).toMatch(/Windscreen/);
  });

  it('GST comes out of the money engine, never from this module', () => {
    // The estimating layer computes AMOUNTS only. This asserts the amounts land in the tax engine
    // correctly, not that the estimating layer knows what tax is — it must never learn.
    const lines = toLineItems(estimate, RATES);
    const totals = summarize(computeLines(lines));

    const expectedNet = 22800 + 33000 + 12600 + 18500 + 36000;
    expect(totals.netCents).toBe(expectedNet);
    expect(totals.gstCents).toBe(Math.round(expectedNet / 10));
    expect(totals.netCents + totals.gstCents).toBe(totals.totalCents);
  });
});

describe('labourHoursByDiscipline', () => {
  it('totals hours per trade and ignores non-labour lines', () => {
    const totals = labourHoursByDiscipline([
      { kind: 'labour', discipline: 'body', description: 'a', hours: 2.4 },
      { kind: 'labour', discipline: 'body', description: 'b', hours: 1.1 },
      { kind: 'labour', discipline: 'paint', description: 'c', hours: 3 },
      { kind: 'part', description: 'd', quantity: 1, unitPriceCents: 100 },
    ]);
    // 2.4 + 1.1 is 3.5000000000000004 unrounded — the re-round is what makes this pass.
    expect(totals).toEqual({ body: 3.5, paint: 3, mechanical: 0 });
  });

  it('reports zeros for an estimate with no labour', () => {
    expect(labourHoursByDiscipline([])).toEqual({ body: 0, paint: 0, mechanical: 0 });
  });
});
