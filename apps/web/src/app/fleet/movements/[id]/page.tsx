'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';
import {
  FleetMovement,
  FleetPhoto,
  PURPOSE_OPTIONS,
  RentalPeriod,
  formatDateTime,
  movementStatusLabel,
  purposeLabel,
} from '@/lib/fleet';

export default function MovementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(() => api.get<FleetMovement>(`/fleet/movements/${id}`), [id]);
  const [editing, setEditing] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBanner message={error} />;
  if (!data) return null;
  const m = data;

  return (
    <>
      <PageHead
        title={`Movement · ${m.carsOutRego || m.carsInRego || '—'}`}
        sub={`${purposeLabel(m.purpose)} · ${movementStatusLabel[m.status]}`}
      >
        {m.status === 'active' ? (
          <button
            className="btn"
            onClick={async () => {
              await api.patch(`/fleet/movements/${id}`, { status: 'returned' });
              reload();
            }}
          >
            Mark returned
          </button>
        ) : null}
        <button className="btn primary" onClick={() => setEditing(true)}>Edit</button>
      </PageHead>

      <div className="card" style={{ padding: 18 }}>
        <KV label="Fleet car out" value={m.carsOutRego || '—'} mono />
        <KV label="Customer car in" value={m.carsInRego || '—'} mono />
        <KV label="Driver" value={[m.driverName, m.driverPhone].filter(Boolean).join(' · ') || '—'} />
        <KV label="Owner" value={[m.ownerName, m.ownerPhone].filter(Boolean).join(' · ') || '—'} />
        <KV label="Purpose" value={purposeLabel(m.purpose)} />
        <KV label="Out at" value={formatDateTime(m.movedAt)} />
        <KV label="Status" value={movementStatusLabel[m.status]} />
        {m.notes ? <KV label="Notes" value={m.notes} /> : null}
        {m.needsReview ? <KV label="Needs review" value={m.reviewReason || 'Flagged'} /> : null}
      </div>

      {m.carsOutRego ? <RentalHistory rego={m.carsOutRego} /> : null}
      <Photos movementId={m.id} />

      {editing ? (
        <EditModal movement={m} onClose={() => setEditing(false)} onDone={() => { setEditing(false); reload(); }} />
      ) : null}
    </>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--border, #eee)' }}>
      <div className="muted" style={{ width: 160 }}>{label}</div>
      <div className={mono ? 'mono' : undefined}>{value}</div>
    </div>
  );
}

function RentalHistory({ rego }: { rego: string }) {
  const { data, loading } = useAsync(() => api.get<RentalPeriod[]>(`/fleet/vehicles/history?rego=${encodeURIComponent(rego)}`), [rego]);
  return (
    <div className="card pad0" style={{ marginTop: 16 }}>
      <div style={{ padding: '12px 18px', fontWeight: 600 }}>Chain of custody — {rego}</div>
      <div className="divider" />
      {loading ? (
        <Loading />
      ) : (data ?? []).length === 0 ? (
        <EmptyState>No history for this car.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Driver</th><th>Out</th><th>Back</th><th>Purpose</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.driverName || '—'}{p.driverPhone ? <span className="muted"> · {p.driverPhone}</span> : null}</td>
                <td className="muted">{formatDateTime(p.outAt)}</td>
                <td className="muted">{p.ongoing ? <span style={{ color: 'var(--red, #be4152)' }}>Still out</span> : formatDateTime(p.backAt)}</td>
                <td>{purposeLabel(p.purpose)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Photos({ movementId }: { movementId: string }) {
  const { data, loading, reload } = useAsync(() => api.get<FleetPhoto[]>(`/fleet/photos?movementId=${movementId}`), [movementId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File, photoType: string) => {
    setBusy(true);
    setError(null);
    try {
      const dataBase64 = await fileToBase64(file);
      await api.post('/fleet/photos', { movementId, photoType, contentType: file.type || 'image/jpeg', dataBase64 });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16, padding: 18 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Photos</div>
        <div className="spacer" style={{ flex: 1 }} />
        <label className="btn sm" style={{ cursor: 'pointer' }}>
          {busy ? 'Uploading…' : '+ Before'}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0], 'before_handover')} />
        </label>{' '}
        <label className="btn sm" style={{ cursor: 'pointer' }}>
          + After
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0], 'after_return')} />
        </label>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <Loading />
      ) : (data ?? []).length === 0 ? (
        <span className="muted">No photos yet.</span>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(data ?? []).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={`/api/backend/fleet/photos/${p.id}/content`}
              alt={p.photoType}
              title={p.photoType}
              style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border, #eee)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

function EditModal({ movement, onClose, onDone }: { movement: FleetMovement; onClose: () => void; onDone: () => void }) {
  const [purpose, setPurpose] = useState(movement.purpose || 'COURTESY');
  const [status, setStatus] = useState(movement.status);
  const [notes, setNotes] = useState(movement.notes);
  const [needsReview, setNeedsReview] = useState(movement.needsReview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/fleet/movements/${movement.id}`, { purpose, status, notes, needsReview });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit movement" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <select className="select" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {PURPOSE_OPTIONS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as FleetMovement['status'])}>
          <option value="active">Out now</option>
          <option value="returned">Returned</option>
          <option value="closed">Closed</option>
        </select>
        <textarea className="input" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <label className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
          <span className="muted">Needs review</span>
        </label>
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}
