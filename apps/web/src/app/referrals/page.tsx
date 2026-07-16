'use client';
import { useState } from 'react';
import { api, Contact, Referral } from '@/lib/api';
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PageHead,
  StatusBadge,
  useAsync,
} from '@/components/ui';

export default function ReferralsPage() {
  const { data, loading, error, reload } = useAsync(() => api.get<Referral[]>('/referrals'), []);
  const [adding, setAdding] = useState(false);
  const [codeFor, setCodeFor] = useState(false);
  const refs = data ?? [];

  const convert = async (r: Referral) => {
    await api.post(`/referrals/${r.id}/convert`, {});
    reload();
  };
  const reward = async (r: Referral) => {
    const note = prompt('Reward note (e.g. "500 points", "$20 credit"):', '') ?? '';
    await api.post(`/referrals/${r.id}/reward`, { note });
    reload();
  };

  return (
    <>
      <PageHead
        title="Referrals"
        sub="Turn happy customers into referrers with trackable incentives"
      >
        <button className="btn" onClick={() => setCodeFor(true)}>
          Get a code
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Record referral
        </button>
      </PageHead>

      <ErrorBanner message={error} />

      <div className="card pad0">
        {loading ? (
          <Loading />
        ) : refs.length === 0 ? (
          <EmptyState>
            No referrals yet. Record one, or share a customer's referral code.
          </EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Referred</th>
                <th>Status</th>
                <th>Reward</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.referredName}{' '}
                    {r.referredPhone ? <span className="muted">· {r.referredPhone}</span> : null}
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="muted">{r.rewardNote ?? '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.status === 'pending' ? (
                      <button className="btn" onClick={() => convert(r)}>
                        Mark converted
                      </button>
                    ) : null}
                    {r.status === 'converted' ? (
                      <button className="btn primary" onClick={() => reward(r)}>
                        Reward
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding ? (
        <RecordModal
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
      {codeFor ? <CodeModal onClose={() => setCodeFor(false)} /> : null}
    </>
  );
}

function CustomerPicker({ onPick }: { onPick: (c: Contact) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const search = async () => {
    if (!q.trim()) return;
    setResults(await api.get<Contact[]>(`/contacts?q=${encodeURIComponent(q.trim())}`));
  };
  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          placeholder="Find a customer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button className="btn" onClick={search}>
          Search
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        {results.map((c) => (
          <button
            key={c.id}
            className="btn"
            style={{ marginRight: 6, marginTop: 6 }}
            onClick={() => onPick(c)}
          >
            {c.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}

function RecordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [referrer, setReferrer] = useState<Contact | null>(null);
  const [referredName, setReferredName] = useState('');
  const [referredPhone, setReferredPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!referrer) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/referrals', {
        referrerContactId: referrer.id,
        referredName,
        referredPhone: referredPhone || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Record a referral" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
            Referred by
          </div>
          {referrer ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{referrer.displayName}</strong>
              <button className="btn" onClick={() => setReferrer(null)}>
                Change
              </button>
            </div>
          ) : (
            <CustomerPicker onPick={setReferrer} />
          )}
        </div>
        <input
          className="input"
          placeholder="New customer's name"
          value={referredName}
          onChange={(e) => setReferredName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Their phone (optional)"
          value={referredPhone}
          onChange={(e) => setReferredPhone(e.target.value)}
        />
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={busy || !referrer || !referredName.trim()}
          >
            {busy ? 'Saving…' : 'Record'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CodeModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [who, setWho] = useState<Contact | null>(null);
  const pick = async (c: Contact) => {
    setWho(c);
    setCode((await api.post<{ code: string }>(`/referrals/codes/${c.id}`, {})).code);
  };
  return (
    <Modal title="Referral code" onClose={onClose}>
      {!code ? (
        <CustomerPicker onPick={pick} />
      ) : (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div className="muted">{who?.displayName}'s code</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
              margin: '8px 0',
            }}
          >
            {code}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            Share this with them to pass on to friends.
          </div>
        </div>
      )}
    </Modal>
  );
}
