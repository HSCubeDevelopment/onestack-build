'use client';
import { useState } from 'react';
import { api, Contact, GiftCard, LoyaltyAccount } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

const money = (c: number) => `$${(c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;

export default function LoyaltyPage() {
  return (
    <>
      <PageHead title="Loyalty & gift cards" sub="Points and gift cards to drive repeat visits" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <GiftCards />
        <Points />
      </div>
    </>
  );
}

function GiftCards() {
  const { data, loading, error, reload } = useAsync(() => api.get<GiftCard[]>('/gift-cards'), []);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const cards = data ?? [];

  const issue = async () => {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    setBusy(true);
    try {
      await api.post('/gift-cards', { initialCents: Math.round(dollars * 100) });
      setAmount('');
      reload();
    } finally {
      setBusy(false);
    }
  };
  const redeem = async (c: GiftCard) => {
    const dollars = Number(prompt(`Redeem how much from ${c.code}? (balance ${money(c.balanceCents)})`, ''));
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    await api.post(`/gift-cards/${c.id}/redeem`, { amountCents: Math.round(dollars * 100) });
    reload();
  };
  const voidCard = async (c: GiftCard) => {
    if (!confirm(`Void gift card ${c.code}?`)) return;
    await api.post(`/gift-cards/${c.id}/void`);
    reload();
  };

  return (
    <div className="card pad0">
      <div className="row" style={{ padding: '12px 18px', gap: 10, alignItems: 'center' }}>
        <strong style={{ flex: 1 }}>Gift cards</strong>
        <input className="input" style={{ maxWidth: 140 }} type="number" placeholder="Amount $" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn primary" onClick={issue} disabled={busy || !amount}>Issue</button>
      </div>
      <div className="divider" />
      <ErrorBanner message={error} />
      {loading ? (
        <Loading />
      ) : cards.length === 0 ? (
        <EmptyState>No gift cards yet.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Code</th><th>Balance</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{c.code}</td>
                <td>{money(c.balanceCents)} <span className="muted">of {money(c.initialCents)}</span></td>
                <td>{c.status === 'void' ? <span className="muted">void</span> : 'active'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {c.status === 'active' ? (
                    <>
                      <button className="btn" onClick={() => redeem(c)} disabled={c.balanceCents <= 0}>Redeem</button>{' '}
                      <button className="btn" onClick={() => voidCard(c)}>Void</button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Points() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [acc, setAcc] = useState<LoyaltyAccount | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!q.trim()) return;
    setResults(await api.get<Contact[]>(`/contacts?q=${encodeURIComponent(q.trim())}`));
  };
  const pick = async (c: Contact) => {
    setSelected(c);
    setResults([]);
    setAcc(await api.get<LoyaltyAccount>(`/loyalty/${c.id}`));
  };
  const adjust = async (delta: number) => {
    if (!selected) return;
    setError(null);
    try {
      setAcc(await api.post<LoyaltyAccount>(`/loyalty/${selected.id}/adjust`, { delta, reason: delta > 0 ? 'earn' : 'redeem' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="card">
      <strong>Customer points</strong>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input className="input" placeholder="Find a customer…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} style={{ maxWidth: 300 }} />
        <button className="btn" onClick={search}>Search</button>
      </div>
      {results.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          {results.map((c) => (
            <button key={c.id} className="btn" style={{ marginRight: 6, marginTop: 6 }} onClick={() => pick(c)}>{c.displayName}</button>
          ))}
        </div>
      ) : null}
      {selected && acc ? (
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{selected.displayName}</span>
            <strong style={{ fontSize: 22 }}>{acc.points} pts</strong>
          </div>
          <ErrorBanner message={error} />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => adjust(10)}>+10</button>
            <button className="btn" onClick={() => adjust(50)}>+50</button>
            <button className="btn" onClick={() => adjust(-50)} disabled={acc.points < 50}>Redeem 50</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
