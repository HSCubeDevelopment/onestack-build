'use client';
import { useState } from 'react';
import { api, Sale } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, PageHead, StatusBadge, useAsync } from '@/components/ui';

const money = (c: number) => `$${(c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;

export default function PosPage() {
  const { data, loading, error, reload } = useAsync(() => api.get<Sale[]>('/sales'), []);
  const [active, setActive] = useState<Sale | null>(null);
  const sales = data ?? [];

  const openSale = async () => setActive(await api.post<Sale>('/sales', {}));

  return (
    <>
      <PageHead title="Point of sale" sub="In-person checkout for walk-ins">
        {!active ? (
          <button className="btn primary" onClick={openSale}>+ New sale</button>
        ) : null}
      </PageHead>

      <ErrorBanner message={error} />

      {active ? (
        <Register sale={active} onChange={setActive} onDone={() => { setActive(null); reload(); }} />
      ) : loading ? (
        <Loading />
      ) : (
        <div className="card pad0">
          <div style={{ padding: '10px 18px', fontWeight: 600 }}>Recent sales</div>
          <div className="divider" />
          {sales.length === 0 ? (
            <EmptyState>No sales yet. Start a new one.</EmptyState>
          ) : (
            <table className="table">
              <thead><tr><th>Ref</th><th>Total</th><th>Tender</th><th>Status</th></tr></thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{s.reference}</td>
                    <td>{money(s.totalCents)}</td>
                    <td className="muted">{s.tenderType ?? '—'}</td>
                    <td><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

function Register({ sale, onChange, onDone }: { sale: Sale; onChange: (s: Sale) => void; onDone: () => void }) {
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addLine = async () => {
    const quantity = parseInt(qty, 10);
    const unitPriceCents = Math.round(parseFloat(price) * 100);
    if (!desc.trim() || !quantity || !Number.isFinite(unitPriceCents)) return;
    setError(null);
    try {
      onChange(await api.post<Sale>(`/sales/${sale.id}/lines`, { description: desc.trim(), quantity, unitPriceCents }));
      setDesc(''); setQty('1'); setPrice('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const removeLine = async (lineId: string) => onChange(await api.del<Sale>(`/sales/${sale.id}/lines/${lineId}`));
  const complete = async (tenderType: 'cash' | 'card' | 'other') => {
    setBusy(true); setError(null);
    try { await api.post(`/sales/${sale.id}/complete`, { tenderType }); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const voidSale = async () => { if (!confirm('Void this sale?')) return; await api.post(`/sales/${sale.id}/void`); onDone(); };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{sale.reference}</strong>
        <button className="btn" onClick={voidSale}>Void</button>
      </div>

      <table className="table" style={{ marginTop: 12 }}>
        <tbody>
          {sale.lines.length === 0 ? (
            <tr><td className="muted" style={{ padding: '10px 0' }}>No items yet.</td></tr>
          ) : sale.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.quantity} × {l.description}</td>
              <td style={{ textAlign: 'right' }}>{money(l.lineTotalCents)}</td>
              <td style={{ textAlign: 'right', width: 40 }}><button className="btn" onClick={() => removeLine(l.id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <input className="input" placeholder="Item" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 2 }} />
        <input className="input" type="number" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 70 }} />
        <input className="input" type="number" placeholder="Price $" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 110 }} />
        <button className="btn" onClick={addLine}>Add</button>
      </div>

      <div style={{ borderTop: '1px solid var(--border, #e2e7eb)', marginTop: 14, paddingTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Subtotal</span><span>{money(sale.subtotalCents)}</span></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">GST</span><span>{money(sale.gstCents)}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}><strong>Total</strong><strong style={{ fontSize: 20 }}>{money(sale.totalCents)}</strong></div>
      </div>

      <ErrorBanner message={error} />
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn primary" disabled={busy || sale.lines.length === 0} onClick={() => complete('cash')}>Take cash</button>
        <button className="btn primary" disabled={busy || sale.lines.length === 0} onClick={() => complete('card')}>Take card</button>
        <button className="btn" disabled={busy || sale.lines.length === 0} onClick={() => complete('other')}>Other</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Records how they paid — card processing comes with the payments phase.</p>
    </div>
  );
}
