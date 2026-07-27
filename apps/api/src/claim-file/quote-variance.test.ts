import { describe, expect, it } from 'vitest';
import { quoteVariance } from './quote-variance';

describe('quoteVariance', () => {
  it('one quote → one invoice, invoiced over the quote', () => {
    const v = quoteVariance(
      [{ id: 'q1', totalCents: 100000 }],
      [{ quoteId: 'q1', totalCents: 112500 }],
    );
    expect(v.quotedCents).toBe(100000);
    expect(v.invoicedCents).toBe(112500);
    expect(v.deltaCents).toBe(12500);
    expect(v.deltaPct).toBe(12.5);
    expect(v.status).toBe('over');
  });

  it('came in under the quote', () => {
    const v = quoteVariance(
      [{ id: 'q1', totalCents: 100000 }],
      [{ quoteId: 'q1', totalCents: 90000 }],
    );
    expect(v.deltaCents).toBe(-10000);
    expect(v.status).toBe('under');
  });

  it('exactly on quote', () => {
    const v = quoteVariance(
      [{ id: 'q1', totalCents: 50000 }],
      [{ quoteId: 'q1', totalCents: 50000 }],
    );
    expect(v.deltaCents).toBe(0);
    expect(v.status).toBe('on_quote');
  });

  it('sums distinct linked quotes (a supplementary), not every quote revision', () => {
    const v = quoteVariance(
      [
        { id: 'q1', totalCents: 100000 },
        { id: 'q2', totalCents: 30000 }, // supplementary
      ],
      [
        { quoteId: 'q1', totalCents: 100000 },
        { quoteId: 'q2', totalCents: 30000 },
      ],
    );
    expect(v.quotedCents).toBe(130000);
    expect(v.invoicedCents).toBe(130000);
    expect(v.status).toBe('on_quote');
  });

  it('no invoices yet → no_data (delta computed but pct null)', () => {
    const v = quoteVariance([{ id: 'q1', totalCents: 100000 }], []);
    expect(v.status).toBe('no_data');
    expect(v.deltaPct).toBeNull();
    expect(v.invoicedCents).toBe(0);
  });

  it('an unlinked invoice falls back to the largest quote', () => {
    const v = quoteVariance(
      [
        { id: 'q1', totalCents: 80000 },
        { id: 'q2', totalCents: 120000 },
      ],
      [{ quoteId: null, totalCents: 118000 }],
    );
    expect(v.quotedCents).toBe(120000); // the largest quote
    expect(v.status).toBe('under');
  });
});
