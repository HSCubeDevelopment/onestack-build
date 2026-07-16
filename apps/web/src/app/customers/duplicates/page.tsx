'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, DuplicateGroup } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

export default function DuplicatesPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(
    () => api.get<DuplicateGroup[]>('/contacts/duplicates'),
    [],
  );
  const groups = data ?? [];

  return (
    <>
      <PageHead
        title="Duplicate customers"
        sub="Find and merge records that look like the same person"
      >
        <button className="btn" onClick={() => router.push('/customers')}>
          ← Customers
        </button>
      </PageHead>

      <ErrorBanner message={error} />

      {loading ? (
        <Loading />
      ) : groups.length === 0 ? (
        <EmptyState>No likely duplicates — your customer list looks clean. 🎉</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((g, i) => (
            <DuplicateCard key={i} group={g} onMerged={reload} />
          ))}
        </div>
      )}
    </>
  );
}

function DuplicateCard({ group, onMerged }: { group: DuplicateGroup; onMerged: () => void }) {
  const [primaryId, setPrimaryId] = useState<string>(group.contacts[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const merge = async () => {
    if (!primaryId) return;
    if (
      !confirm(
        'Merge the other record(s) into the selected one? The others are removed (recoverable).',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      for (const c of group.contacts) {
        if (c.id === primaryId) continue;
        await api.post(`/contacts/${primaryId}/merge/${c.id}`);
      }
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}
      >
        <strong>Possible duplicate</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          matches on {group.reasons.join(', ')}
        </span>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>Keep</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {group.contacts.map((c) => (
            <tr key={c.id}>
              <td>
                <label className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name={`primary-${group.contacts.map((x) => x.id).join('-')}`}
                    checked={primaryId === c.id}
                    onChange={() => setPrimaryId(c.id)}
                  />
                  {primaryId === c.id ? <span className="muted">primary</span> : null}
                </label>
              </td>
              <td>{c.displayName}</td>
              <td>{c.phone ?? '—'}</td>
              <td>{c.email ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ErrorBanner message={error} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn primary" onClick={merge} disabled={busy}>
          {busy ? 'Merging…' : 'Merge into selected'}
        </button>
      </div>
    </div>
  );
}
