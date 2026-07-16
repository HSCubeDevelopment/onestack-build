'use client';
import { useState } from 'react';
import { api, Resource, WaitlistEntry } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';

export default function WaitlistPage() {
  const { data, loading, error, reload } = useAsync(
    () => api.get<WaitlistEntry[]>('/waitlist'),
    [],
  );
  const { data: resources } = useAsync(() => api.get<Resource[]>('/resources').catch(() => []), []);
  const entries = data ?? [];
  const res = resources ?? [];

  const [adding, setAdding] = useState(false);
  const [filling, setFilling] = useState<WaitlistEntry | null>(null);

  const resourceName = (id: string | null) => res.find((r) => r.id === id)?.name ?? null;

  const remove = async (id: string) => {
    if (!confirm('Remove this person from the waitlist?')) return;
    await api.del(`/waitlist/${id}`);
    reload();
  };

  return (
    <>
      <PageHead title="Waitlist" sub="Fill cancellations to protect utilisation">
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Add to waitlist
        </button>
      </PageHead>

      <ErrorBanner message={error} />

      <div className="card pad0">
        {loading ? (
          <Loading />
        ) : entries.length === 0 ? (
          <EmptyState>Nobody's waiting. When a slot frees up, add people here.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Prefers</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.phone}</td>
                  <td>{resourceName(e.resourceId) ?? 'Any'}</td>
                  <td className="muted">{e.notes ?? '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn primary"
                      onClick={() => setFilling(e)}
                      disabled={res.length === 0}
                    >
                      Fill slot
                    </button>{' '}
                    <button className="btn" onClick={() => remove(e.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding ? (
        <AddModal
          resources={res}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
      {filling ? (
        <FillModal
          entry={filling}
          resources={res}
          onClose={() => setFilling(null)}
          onDone={() => {
            setFilling(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function AddModal({
  resources,
  onClose,
  onDone,
}: {
  resources: Resource[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/waitlist', {
        name,
        phone,
        notes: notes || undefined,
        resourceId: resourceId || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add to waitlist" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          className="input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <select
          className="input"
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
        >
          <option value="">Any resource</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={busy || !name.trim() || !phone.trim()}
          >
            {busy ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FillModal({
  entry,
  resources,
  onClose,
  onDone,
}: {
  entry: WaitlistEntry;
  resources: Resource[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [resourceId, setResourceId] = useState(entry.resourceId ?? resources[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fill = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/waitlist/${entry.id}/fill`, {
        resourceId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Book ${entry.name} into a slot`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className="muted" style={{ fontSize: 13 }}>
          Resource
        </label>
        <select
          className="input"
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <label className="muted" style={{ fontSize: 13 }}>
          Start
        </label>
        <input
          className="input"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        <label className="muted" style={{ fontSize: 13 }}>
          End
        </label>
        <input
          className="input"
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={fill}
            disabled={busy || !resourceId || !startsAt || !endsAt}
          >
            {busy ? 'Booking…' : 'Confirm booking'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
