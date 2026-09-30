'use client';
import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { compressToBase64 } from '@/lib/image';
import {
  addToTray,
  emptyTray,
  photosIn,
  removeFromTray,
  stagedPhoto,
  trayCount,
  trayUploads,
  uploadLabel,
  type PhotoTray,
  type StagedPhoto,
} from '@/lib/photo-tray';
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
  const { data, loading, error, reload } = useAsync(
    () => api.get<FleetMovement>(`/fleet/movements/${id}`),
    [id],
  );
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
        <button className="btn primary" onClick={() => setEditing(true)}>
          Edit
        </button>
      </PageHead>

      <div className="card" style={{ padding: 18 }}>
        <KV label="Fleet car out" value={m.carsOutRego || '—'} mono />
        <KV label="Customer car in" value={m.carsInRego || '—'} mono />
        <KV
          label="Driver"
          value={[m.driverName, m.driverPhone].filter(Boolean).join(' · ') || '—'}
        />
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
        <EditModal
          movement={m}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="row"
      style={{ padding: '7px 0', borderBottom: '1px solid var(--border, #eee)' }}
    >
      <div className="muted" style={{ width: 160 }}>
        {label}
      </div>
      <div className={mono ? 'mono' : undefined}>{value}</div>
    </div>
  );
}

function RentalHistory({ rego }: { rego: string }) {
  const { data, loading } = useAsync(
    () => api.get<RentalPeriod[]>(`/fleet/vehicles/history?rego=${encodeURIComponent(rego)}`),
    [rego],
  );
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
            <tr>
              <th>Driver</th>
              <th>Out</th>
              <th>Back</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id}>
                <td>
                  {p.driverName || '—'}
                  {p.driverPhone ? <span className="muted"> · {p.driverPhone}</span> : null}
                </td>
                <td className="muted">{formatDateTime(p.outAt)}</td>
                <td className="muted">
                  {p.ongoing ? (
                    <span style={{ color: 'var(--red, #be4152)' }}>Still out</span>
                  ) : (
                    formatDateTime(p.backAt)
                  )}
                </td>
                <td>{purposeLabel(p.purpose)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The two documentation points on a movement: the car as it went out, and as it came back. */
const MOVEMENT_PHOTO_TYPES = [
  { key: 'before_handover', label: 'Before' },
  { key: 'after_return', label: 'After' },
] as const;
type MovementPhotoType = (typeof MOVEMENT_PHOTO_TYPES)[number]['key'];
const MOVEMENT_PHOTO_ORDER: readonly MovementPhotoType[] = MOVEMENT_PHOTO_TYPES.map((t) => t.key);

/**
 * Movement photos. Pick as many as the handover needs — for either point — review them, then send the
 * lot with one press. Photos stage on the device first, so a phone camera that only returns one shot
 * per tap doesn't mean one upload per shot.
 */
function Photos({ movementId }: { movementId: string }) {
  const { data, loading, reload } = useAsync(
    () => api.get<FleetPhoto[]>(`/fleet/photos?movementId=${movementId}`),
    [movementId],
  );
  const [tray, setTray] = useState<PhotoTray<MovementPhotoType>>(() =>
    emptyTray<MovementPhotoType>(),
  );
  const [uploading, setUploading] = useState(false);
  const [staging, setStaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const busy = uploading || staging;
  const staged = trayCount(tray);

  const stageFiles = async (list: FileList | null, photoType: MovementPhotoType) => {
    if (!list || list.length === 0) return;
    setError(null);
    setStaging(true);
    try {
      const picked: StagedPhoto[] = [];
      let unreadable = 0;
      for (const f of Array.from(list)) {
        try {
          const { dataBase64, contentType } = await compressToBase64(f);
          seq.current += 1;
          picked.push(stagedPhoto(`s${seq.current}`, dataBase64, contentType, f.name));
        } catch {
          unreadable += 1;
        }
      }
      if (picked.length > 0) setTray((t) => addToTray(t, photoType, picked).tray);
      if (unreadable > 0) setError('Could not read one of the photos — it was skipped.');
    } finally {
      setStaging(false);
    }
  };

  const uploadAll = async () => {
    if (staged === 0) return;
    setUploading(true);
    setError(null);
    const queue = trayUploads(tray, MOVEMENT_PHOTO_ORDER);
    let sent = 0;
    try {
      for (const { key, photo } of queue) {
        await api.post('/fleet/photos', {
          movementId,
          photoType: key,
          contentType: photo.contentType,
          dataBase64: photo.dataBase64,
        });
        // Un-stage as each lands, so a mid-way failure leaves only what still needs sending.
        setTray((t) => removeFromTray(t, key, photo.id));
        sent += 1;
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setError(
        sent > 0
          ? `${detail} (${sent} of ${queue.length} uploaded — the rest are still here.)`
          : detail,
      );
    } finally {
      setUploading(false);
      if (sent > 0) reload();
    }
  };

  return (
    <div className="card" style={{ marginTop: 16, padding: 18 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Photos</div>
        <div className="spacer" style={{ flex: 1 }} />
        {MOVEMENT_PHOTO_TYPES.map((t) => (
          <label
            key={t.key}
            className="btn sm"
            style={{ cursor: busy ? 'default' : 'pointer', marginLeft: 8 }}
          >
            {`+ ${t.label}`}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              style={{ display: 'none' }}
              onChange={(e) => void stageFiles(e.target.files, t.key)}
            />
          </label>
        ))}
      </div>
      <ErrorBanner message={error} />

      {/* Staged photos — on the device, not yet uploaded. */}
      {staged > 0 && (
        <div style={{ marginBottom: 14 }}>
          {MOVEMENT_PHOTO_TYPES.map((t) => {
            const waiting = photosIn(tray, t.key);
            if (waiting.length === 0) return null;
            return (
              <div key={t.key} style={{ marginBottom: 8 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  {t.label} · {waiting.length} waiting
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {waiting.map((sp) => (
                    <span key={sp.id} style={{ position: 'relative', display: 'inline-block' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sp.preview}
                        alt={`${t.label} photo, waiting to upload`}
                        title="Not uploaded yet"
                        style={{
                          width: 120,
                          height: 120,
                          objectFit: 'cover',
                          borderRadius: 8,
                          border: '2px solid var(--orange, #f59e0b)',
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        disabled={busy}
                        onClick={() => setTray((tr) => removeFromTray(tr, t.key, sp.id))}
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 24,
                          height: 24,
                          border: 'none',
                          borderRadius: 999,
                          background: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <X size={14} strokeWidth={3} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <button type="button" className="btn sm" disabled={busy} onClick={() => void uploadAll()}>
            {uploading ? `Uploading ${staged}…` : uploadLabel(tray)}
          </button>
        </div>
      )}

      {loading ? (
        <Loading />
      ) : (data ?? []).length === 0 ? (
        staged === 0 ? (
          <span className="muted">No photos yet.</span>
        ) : null
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(data ?? []).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={`/api/backend/fleet/photos/${p.id}/content`}
              alt={p.photoType}
              title={p.photoType}
              style={{
                width: 120,
                height: 120,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid var(--border, #eee)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EditModal({
  movement,
  onClose,
  onDone,
}: {
  movement: FleetMovement;
  onClose: () => void;
  onDone: () => void;
}) {
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
          {PURPOSE_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value as FleetMovement['status'])}
        >
          <option value="active">Out now</option>
          <option value="returned">Returned</option>
          <option value="closed">Closed</option>
        </select>
        <textarea
          className="input"
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
        <label className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={needsReview}
            onChange={(e) => setNeedsReview(e.target.checked)}
          />
          <span className="muted">Needs review</span>
        </label>
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
