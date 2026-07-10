'use client';
import { useState } from 'react';
import { api, Integration } from '@/lib/api';
import { ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

export default function IntegrationsPage() {
  const { data, loading, error, reload } = useAsync(() => api.get<Integration[]>('/integrations'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const items = data ?? [];

  const connect = async (i: Integration) => {
    setBusy(i.slug);
    try { await api.post(`/integrations/${i.slug}/connect`, {}); reload(); } finally { setBusy(null); }
  };
  const disconnect = async (i: Integration) => {
    setBusy(i.slug);
    try { await api.post(`/integrations/${i.slug}/disconnect`); reload(); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHead title="Integrations" sub="Connect OneStack to the tools you already use" />
      <ErrorBanner message={error} />
      {loading ? (
        <Loading />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {items.map((i) => (
            <div className="card" key={i.slug} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{i.name}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{i.category}</span>
              </div>
              <p className="muted" style={{ fontSize: 13, flex: 1, margin: 0 }}>{i.description}</p>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                {i.status === 'connected' ? (
                  <span style={{ color: 'var(--success, #1c9668)', fontSize: 13, fontWeight: 600 }}>● Connected</span>
                ) : (
                  <span className="muted" style={{ fontSize: 13 }}>{i.available ? 'Not connected' : 'Coming soon'}</span>
                )}
                {i.status === 'connected' ? (
                  <button className="btn" onClick={() => disconnect(i)} disabled={busy === i.slug}>Disconnect</button>
                ) : (
                  <button className="btn primary" onClick={() => connect(i)} disabled={busy === i.slug || !i.available} title={i.available ? '' : 'Coming soon'}>
                    Connect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
