// Unit tests for the pure supplier-invoice logic (Phase 2): line normalisation, total owed, and the two
// no-op vendor boundaries (OCR, accounting). No DB — the DB-backed service is covered by the int test.
import { describe, expect, it } from 'vitest';
import { normaliseInvoiceLines, supplierInvoiceTotalCents } from './supplier-invoice';
import { NoopBookkeepingSync, NoopSupplierInvoiceOcr } from './supplier-invoice-vendors';

const fail = (m: string) => new Error(m);

describe('normaliseInvoiceLines', () => {
  it('trims and defaults quantity/price', () => {
    expect(normaliseInvoiceLines([{ description: '  Filler  ' }], fail)).toEqual([
      { description: 'Filler', quantity: 1, unitPriceCents: 0 },
    ]);
  });

  it('rejects empty list, blank description, bad quantity or price', () => {
    expect(() => normaliseInvoiceLines([], fail)).toThrow(/at least one line/i);
    expect(() => normaliseInvoiceLines([{ description: ' ' }], fail)).toThrow(/description/i);
    expect(() => normaliseInvoiceLines([{ description: 'x', quantity: 0 }], fail)).toThrow(
      /quantity/i,
    );
    expect(() => normaliseInvoiceLines([{ description: 'x', unitPriceCents: -1 }], fail)).toThrow(
      /unitPriceCents/i,
    );
  });
});

describe('supplierInvoiceTotalCents', () => {
  it('sums quantity × unit price (what we owe)', () => {
    expect(
      supplierInvoiceTotalCents([
        { quantity: 2, unitPriceCents: 1500 },
        { quantity: 1, unitPriceCents: 4200 },
      ]),
    ).toBe(7200);
  });

  it('is 0 for no lines', () => {
    expect(supplierInvoiceTotalCents([])).toBe(0);
  });
});

describe('no-op vendor boundaries', () => {
  it('OCR extracts nothing and says to enter manually', async () => {
    const r = await new NoopSupplierInvoiceOcr().scan();
    expect(r.extracted).toBe(false);
    expect(r.suggestion).toBeNull();
    expect(r.reason).toMatch(/no ocr provider/i);
  });

  it('accounting sync exports nothing and says why', async () => {
    const r = await new NoopBookkeepingSync().push();
    expect(r.exported).toBe(false);
    expect(r.externalId).toBeNull();
    expect(r.reason).toMatch(/no accounting provider/i);
  });
});
