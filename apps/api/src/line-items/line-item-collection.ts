import { randomUUID } from 'node:crypto';
import { computeLine, LineItemInput, summarize, Totals } from './line-item';

/**
 * Pure add / edit / remove / reorder operations over a set of line items (card #6.9). The SAME operations
 * back both a Quote and an Invoice. Immutable: each returns a new array. Persistence (mapping these to DB
 * rows with a parent Quote/Invoice + tenantId) is layered on when the DB is available.
 */
export interface LineItemRecord extends LineItemInput {
  id: string;
  sortOrder: number;
}

export function addLine(items: LineItemRecord[], input: LineItemInput): LineItemRecord[] {
  const sortOrder = items.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;
  return [...items, { ...input, id: randomUUID(), sortOrder }];
}

export function editLine(
  items: LineItemRecord[],
  id: string,
  patch: Partial<LineItemInput>,
): LineItemRecord[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

export function removeLine(items: LineItemRecord[], id: string): LineItemRecord[] {
  return items.filter((i) => i.id !== id);
}

/** Reassign sortOrder to match `orderedIds`, which must be a permutation of the current ids. */
export function reorderLines(items: LineItemRecord[], orderedIds: string[]): LineItemRecord[] {
  const ids = new Set(items.map((i) => i.id));
  if (orderedIds.length !== items.length || !orderedIds.every((id) => ids.has(id))) {
    throw new Error('reorder ids must be a permutation of the current line ids');
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  return orderedIds.map((id, index) => ({ ...(byId.get(id) as LineItemRecord), sortOrder: index }));
}

/** Totals for the collection, computed in sort order. */
export function collectionTotals(items: LineItemRecord[]): Totals {
  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  return summarize(ordered.map(computeLine));
}
