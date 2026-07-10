'use client';
import { useState } from 'react';
import { api, WebhookDelivery, WebhookEndpoint } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, PageHead, StatusBadge, useAsync } from '@/components/ui';

export default function WebhooksPage() {
  const { data, loading, error, reload } = useAsync(() => api.get<WebhookEndpoint[]>('/webhooks'), []);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('*');
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const endpoints = data ?? [];

  const add = async () => {
    setBusy(true);
    setAddError(null);
    try {
      await api.post('/webhooks', { url: url.trim(), events: events.split(',').map((e) => e.trim()).filter(Boolean) });
      setUrl('');
      setEvents('*');
      reload();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Webhooks" sub="Signed event delivery so partners can integrate and extend" />
      <ErrorBanner message={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <strong>Add an endpoint</strong>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input className="input" placeholder="https://example.com/hook" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 2, minWidth: 240 }} />
          <input className="input" placeholder="Events (comma-sep, * = all)" value={events} onChange={(e) => setEvents(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <button className="btn primary" onClick={add} disabled={busy || !url.trim()}>Add</button>
        </div>
        <ErrorBanner message={addError} />
      </div>

      {loading ? (
        <Loading />
      ) : endpoints.length === 0 ? (
        <div className="card"><EmptyState>No webhook endpoints yet.</EmptyState></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {endpoints.map((ep) => (
            <EndpointCard key={ep.id} ep={ep} onChange={reload} />
          ))}
        </div>
      )}
    </>
  );
}

function EndpointCard({ ep, onChange }: { ep: WebhookEndpoint; onChange: () => void }) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      await api.post(`/webhooks/${ep.id}/test`);
      setDeliveries(await api.get<WebhookDelivery[]>(`/webhooks/${ep.id}/deliveries`));
    } finally {
      setTesting(false);
    }
  };
  const loadDeliveries = async () => setDeliveries(await api.get<WebhookDelivery[]>(`/webhooks/${ep.id}/deliveries`));
  const remove = async () => { if (!confirm('Delete this endpoint?')) return; await api.del(`/webhooks/${ep.id}`); onChange(); };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>{ep.url}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={test} disabled={testing}>{testing ? 'Sending…' : 'Send test'}</button>
          <button className="btn" onClick={() => (deliveries ? setDeliveries(null) : loadDeliveries())}>Log</button>
          <button className="btn" onClick={remove}>Delete</button>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Events: {ep.events.join(', ')}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4, fontFamily: 'var(--font-mono, monospace)' }}>Secret: {ep.secret}</div>
      {deliveries ? (
        <table className="table" style={{ marginTop: 10 }}>
          <tbody>
            {deliveries.length === 0 ? (
              <tr><td className="muted">No deliveries yet.</td></tr>
            ) : deliveries.map((d) => (
              <tr key={d.id}>
                <td>{d.eventType}</td>
                <td><StatusBadge status={d.status} /></td>
                <td className="muted">{d.responseCode ?? d.error ?? ''}</td>
                <td className="muted">{new Date(d.createdAt).toLocaleString('en-AU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
