import { describe, expect, it } from 'vitest';
import {
  addLine,
  collectionTotals,
  editLine,
  LineItemRecord,
  removeLine,
  reorderLines,
} from './line-item-collection';
import { LineItemInput } from './line-item';

const line = (over: Partial<LineItemInput> = {}): LineItemInput => ({
  description: 'x',
  type: 'product',
  quantity: 1,
  unitPriceCents: 1000,
  taxCode: 'GST',
  taxTreatment: 'exclusive',
  ...over,
});

describe('line item collection ops', () => {
  it('adds lines with incrementing sort order', () => {
    let items: LineItemRecord[] = [];
    items = addLine(items, line());
    items = addLine(items, line({ unitPriceCents: 2000 }));
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1]);
  });

  it('edits and removes by id', () => {
    let items = addLine([], line());
    const id = items[0]!.id;
    items = editLine(items, id, { quantity: 3 });
    expect(items[0]!.quantity).toBe(3);
    items = removeLine(items, id);
    expect(items).toHaveLength(0);
  });

  it('reorders by id list and rejects a non-permutation', () => {
    let items = addLine(addLine([], line()), line({ unitPriceCents: 5000 }));
    const [a, b] = items;
    items = reorderLines(items, [b!.id, a!.id]);
    expect(items.map((i) => i.id)).toEqual([b!.id, a!.id]);
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(() => reorderLines(items, [a!.id])).toThrow();
    expect(() => reorderLines(items, [a!.id, 'ghost'])).toThrow();
  });

  it('totals the collection with sum(net)+sum(gst)===sum(total)', () => {
    let items: LineItemRecord[] = [];
    items = addLine(items, line({ quantity: 2, unitPriceCents: 5000, taxTreatment: 'exclusive' }));
    items = addLine(items, line({ quantity: 1, unitPriceCents: 3300, taxTreatment: 'inclusive' }));
    items = addLine(items, line({ taxCode: 'GST_FREE', unitPriceCents: 250, quantity: 4 }));
    const t = collectionTotals(items);
    expect(t.netCents + t.gstCents).toBe(t.totalCents);
    expect(t.totalCents).toBeGreaterThan(0);
  });
});
