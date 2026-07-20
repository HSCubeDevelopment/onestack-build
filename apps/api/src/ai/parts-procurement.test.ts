import { describe, expect, it } from 'vitest';
import {
  canTransitionTo,
  partMargin,
  ProcurementStatus,
  statusAfterReceipt,
  summariseParts,
} from './parts-procurement';

describe('partMargin', () => {
  it('computes margin in dollars and as a percentage of sell', () => {
    // $185 sell, $120 buy → $65 on $185 = 35.1%.
    const m = partMargin({ quantity: 1, unitPriceCents: 18500, buyPriceCents: 12000 });
    expect(m.marginCents).toBe(6500);
    expect(m.marginPercent).toBe(35.1);
    expect(m.unknown).toBe(false);
  });

  it('multiplies by quantity', () => {
    const m = partMargin({ quantity: 3, unitPriceCents: 10000, buyPriceCents: 6000 });
    expect(m.marginCents).toBe(12000);
    expect(m.marginPercent).toBe(40);
  });

  it('reports UNKNOWN rather than 100% when the buy price is missing', () => {
    // The whole point. Treating a missing cost as zero shows 100% margin on every part nobody has
    // priced — the most flattering possible lie, on the number the business runs on.
    const m = partMargin({ quantity: 1, unitPriceCents: 18500, buyPriceCents: null });
    expect(m.unknown).toBe(true);
    expect(m.marginPercent).toBeNull();
  });

  it('reports a loss as a negative margin, not as zero', () => {
    const m = partMargin({ quantity: 1, unitPriceCents: 9000, buyPriceCents: 12000 });
    expect(m.marginCents).toBe(-3000);
    expect(m.marginPercent).toBeLessThan(0);
  });

  it('declines a percentage rather than dividing by zero on a free part', () => {
    const freeAndFree = partMargin({ quantity: 1, unitPriceCents: 0, buyPriceCents: 0 });
    expect({ c: freeAndFree.marginCents, p: freeAndFree.marginPercent }).toEqual({ c: 0, p: 0 });

    const givenAway = partMargin({ quantity: 1, unitPriceCents: 0, buyPriceCents: 5000 });
    expect(givenAway.marginCents).toBe(-5000);
    expect(givenAway.marginPercent).toBeNull(); // not -Infinity
  });

  it('rounds the percentage to one decimal, half-up', () => {
    // 1c margin on 3c sell = 33.333…% → 33.3%.
    expect(partMargin({ quantity: 1, unitPriceCents: 3, buyPriceCents: 2 }).marginPercent).toBe(
      33.3,
    );
  });

  it('rejects a nonsensical quantity', () => {
    expect(() => partMargin({ quantity: -1, unitPriceCents: 100, buyPriceCents: 50 })).toThrow(
      RangeError,
    );
  });
});

describe('summariseParts', () => {
  it('totals only the priced lines and says how many were skipped', () => {
    // Folding unpriced lines in either direction gives one confident number that is wrong. Excluding
    // them keeps the percentage truthful and `unpricedCount` says how much is missing.
    const s = summariseParts([
      { quantity: 1, unitPriceCents: 18500, buyPriceCents: 12000 },
      { quantity: 2, unitPriceCents: 5000, buyPriceCents: 3000 },
      { quantity: 1, unitPriceCents: 9900, buyPriceCents: null },
    ]);
    expect(s.lineCount).toBe(3);
    expect(s.unpricedCount).toBe(1);
    expect(s.sellTotalCents).toBe(18500 + 10000);
    expect(s.buyTotalCents).toBe(12000 + 6000);
    expect(s.marginCents).toBe(10500);
  });

  it('handles a job where nothing has a buy price yet', () => {
    const s = summariseParts([{ quantity: 1, unitPriceCents: 18500, buyPriceCents: null }]);
    expect(s.unpricedCount).toBe(1);
    expect(s.marginPercent).toBeNull();
    expect(s.marginCents).toBe(0);
  });

  it('handles no parts at all', () => {
    expect(summariseParts([])).toMatchObject({ lineCount: 0, marginCents: 0, marginPercent: null });
  });
});

describe('canTransitionTo', () => {
  it('walks the normal ordering cycle', () => {
    expect(canTransitionTo('needed', 'ordered')).toBe(true);
    expect(canTransitionTo('ordered', 'received')).toBe(true);
    expect(canTransitionTo('ordered', 'back_order')).toBe(true);
  });

  it('lets a back-order go back to ordered — suppliers change their minds', () => {
    expect(canTransitionTo('back_order', 'ordered')).toBe(true);
    expect(canTransitionTo('back_order', 'received')).toBe(true);
  });

  it('refuses to leave received', () => {
    // Once stock is physically on the shelf, flipping back to "ordered" makes the goods-received
    // record meaningless. Correcting a mistaken receipt is a deliberate action, not a status change.
    for (const to of ['needed', 'ordered', 'back_order', 'cancelled'] as ProcurementStatus[]) {
      expect(canTransitionTo('received', to), `received → ${to}`).toBe(false);
    }
  });

  it('allows cancelling from anywhere except received', () => {
    for (const from of ['needed', 'ordered', 'back_order'] as ProcurementStatus[]) {
      expect(canTransitionTo(from, 'cancelled'), `${from} → cancelled`).toBe(true);
    }
  });

  it('lets a cancelled line be re-opened rather than duplicated', () => {
    expect(canTransitionTo('cancelled', 'needed')).toBe(true);
  });

  it('treats a no-op as allowed', () => {
    expect(canTransitionTo('ordered', 'ordered')).toBe(true);
  });

  it('refuses to skip straight from needed to received', () => {
    expect(canTransitionTo('needed', 'received')).toBe(false);
  });
});

describe('statusAfterReceipt', () => {
  it('leaves a partial delivery back-ordered', () => {
    // 2 of 3 guards arriving is the normal case, not an edge case.
    expect(statusAfterReceipt(3, 2)).toBe('back_order');
  });

  it('marks a full delivery received', () => {
    expect(statusAfterReceipt(3, 3)).toBe('received');
  });

  it('treats an over-delivery as received rather than an error', () => {
    // The supplier sent 4 when we ordered 3. The line is satisfied; the extra is a stock question,
    // not a reason to leave the job showing outstanding parts.
    expect(statusAfterReceipt(3, 4)).toBe('received');
  });
});
