/**
 * Quote-vs-invoice variance (photo-to-quote Stage 9 feedback). Pure; no DB, no Nest, no network.
 *
 * Compares what was quoted with what was finally invoiced — the reconciliation an insurer/lawyer pack
 * needs, and the number that (over time) calibrates the estimate. `quoted` is the total of the quotes the
 * invoices were raised from (each quote once); if no invoice links a quote yet, it falls back to the
 * largest quote on the job (the one most likely to be the authorised figure).
 */
export interface QuoteVariance {
  quotedCents: number;
  invoicedCents: number;
  deltaCents: number; // invoiced − quoted (positive = came in over the quote)
  deltaPct: number | null; // rounded to 0.1%; null when there's nothing to divide by
  status: 'on_quote' | 'over' | 'under' | 'no_data';
}

export function quoteVariance(
  quotes: { id: string; totalCents: number }[],
  invoices: { quoteId: string | null; totalCents: number }[],
): QuoteVariance {
  const invoicedCents = invoices.reduce((s, i) => s + i.totalCents, 0);
  const totalById = new Map(quotes.map((q) => [q.id, q.totalCents]));

  // Prefer the quotes the invoices were actually raised from (each once); else the largest quote.
  const linkedIds = new Set(invoices.map((i) => i.quoteId).filter((id): id is string => !!id));
  let quotedCents = 0;
  if (linkedIds.size > 0) {
    for (const id of linkedIds) quotedCents += totalById.get(id) ?? 0;
  } else {
    quotedCents = quotes.reduce((max, q) => Math.max(max, q.totalCents), 0);
  }

  if (quotes.length === 0 || invoices.length === 0) {
    return {
      quotedCents,
      invoicedCents,
      deltaCents: invoicedCents - quotedCents,
      deltaPct: null,
      status: 'no_data',
    };
  }

  const deltaCents = invoicedCents - quotedCents;
  const deltaPct = quotedCents > 0 ? Math.round((deltaCents / quotedCents) * 1000) / 10 : null;
  const status = deltaCents === 0 ? 'on_quote' : deltaCents > 0 ? 'over' : 'under';
  return { quotedCents, invoicedCents, deltaCents, deltaPct, status };
}
