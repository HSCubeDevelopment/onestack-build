'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ErrorBanner, Loading, useAsync } from '@/components/ui';
import {
  FleetPhoto,
  FleetVehicle,
  RentalPeriod,
  vehicleStatusColor,
  vehicleStatusLabel,
} from '@/lib/fleet';
import { isActiveFleet } from '@/lib/active-fleet';
import { LiveLocation } from '@/components/LiveLocation';

/**
 * The car (vehicle) record — a faithful port of the source In N Out RecordDetail vehicle view:
 * header → make/model/type/ownership → Live location → Notes (editable) → Rental history → Photos →
 * History. Reached from the Cars list; renders in the Auto Tech shell for employees (iOS look) and the
 * OneStack shell for the owner.
 */
function CarRecord() {
  const router = useRouter();
  const rego = (useSearchParams().get('rego') ?? '').toUpperCase();

  const vehicle = useAsync(
    () =>
      api.getOr<FleetVehicle | null>(
        `/fleet/vehicles/lookup?rego=${encodeURIComponent(rego)}`,
        null,
      ),
    [rego],
  );
  const history = useAsync(
    () => api.getOr<RentalPeriod[]>(`/fleet/vehicles/history?rego=${encodeURIComponent(rego)}`, []),
    [rego],
  );
  const v = vehicle.data ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => router.back()}
        className="link-btn"
        style={{ marginBottom: 8 }}
      >
        <ChevronLeft size={18} /> Back
      </button>

      <ErrorBanner message={vehicle.error} />

      {vehicle.loading ? (
        <Loading />
      ) : !v ? (
        <div className="card">
          <div className="muted" style={{ padding: 6 }}>
            No car found for {rego || '—'}.
          </div>
        </div>
      ) : (
        <>
          {/* Header + basics */}
          <div className="card pad0" style={{ marginBottom: 12 }}>
            <div className="recdet-head">
              <span className="rego-big">{v.rego}</span>
              <span className={`badge ${vehicleStatusColor[v.status] || ''}`}>
                {vehicleStatusLabel[v.status]}
              </span>
            </div>
            <DetailRow label="Make & model" value={[v.make, v.model].filter(Boolean).join(' ')} />
            <DetailRow label="Type" value={v.vehicleType} />
            <DetailRow label="Ownership" value={v.isCompanyCar ? 'Fleet car' : 'Customer car'} />
          </div>

          {/* Live location (CityTag) — fleet / active-fleet cars only, like the source. */}
          {v.isCompanyCar || isActiveFleet(v.rego) ? <LiveLocation rego={v.rego} /> : null}

          {/* Editable notes */}
          <VehicleNotes vehicle={v} onSaved={(notes) => vehicle.setData({ ...v, notes })} />

          {/* Rental history */}
          <SectionHeader>
            Rental history{(history.data ?? []).length ? ` (${history.data!.length})` : ''}
          </SectionHeader>
          <div className="card pad0" style={{ marginBottom: 12 }}>
            {history.loading ? (
              <Loading />
            ) : (history.data ?? []).length === 0 ? (
              <div className="muted" style={{ padding: '12px 14px' }}>
                This car has never been recorded going out.
              </div>
            ) : (
              history.data!.map((p) => (
                <RentalRow
                  key={p.id}
                  p={p}
                  onOpen={() => {
                    if (p.movementId) router.push(`/fleet/movements/${p.movementId}`);
                  }}
                />
              ))
            )}
          </div>

          {/* Photos */}
          <VehiclePhotos vehicleId={v.id} isCompanyCar={v.isCompanyCar} />

          {/* History (audit) */}
          <SectionHeader>History</SectionHeader>
          <div className="card pad0">
            <div className="muted" style={{ padding: '12px 14px' }}>
              No history yet.
            </div>
          </div>
        </>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="recdet-row">
      <span className="recdet-label">{label}</span>
      <span className="recdet-value">{value || '—'}</span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="recdet-section">{children}</div>;
}

/** Always-visible, inline-editable car notes (service history, damage, reminders). */
function VehicleNotes({
  vehicle,
  onSaved,
}: {
  vehicle: FleetVehicle;
  onSaved: (notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(vehicle.notes || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const next = draft.trim();
      await api.patch(`/fleet/vehicles/${vehicle.id}`, { notes: next });
      onSaved(next);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save notes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="recdet-section" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Notes</span>
        {!editing ? (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setDraft(vehicle.notes || '');
              setEditing(true);
            }}
          >
            {vehicle.notes ? 'Edit' : 'Add'}
          </button>
        ) : null}
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <ErrorBanner message={err} />
        {editing ? (
          <div className="stack" style={{ gap: 10 }}>
            <textarea
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Service history, damage, reminders — anything about this car…"
              rows={3}
            />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                style={{ flex: 1 }}
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>
            {vehicle.notes ? vehicle.notes : <span className="muted">No notes yet.</span>}
          </div>
        )}
      </div>
    </>
  );
}

/** One out→back rental period, with the source's status badge + subtitle. */
function RentalRow({ p, onOpen }: { p: RentalPeriod; onOpen: () => void }) {
  const endISO = p.ongoing ? new Date().toISOString() : p.backAt;
  const dur = p.outAt ? formatDuration(p.outAt, endISO) : '';
  const dates = p.outAt
    ? `${formatDate(p.outAt)} → ${p.ongoing ? 'now' : p.backAt ? formatDate(p.backAt) : 'not recorded'}`
    : p.backAt
      ? `Returned ${formatDate(p.backAt)}`
      : 'Date not recorded';
  const badge = p.ongoing
    ? ['red', 'Still out']
    : p.outAt && p.backAt
      ? ['green', 'Returned']
      : p.outAt
        ? ['amber', 'No return']
        : ['', 'Return only'];
  const clickable = !!(p.movementId || p.returnId);
  return (
    <div
      className="job-row"
      style={{ cursor: clickable ? 'pointer' : 'default', alignItems: 'flex-start' }}
      onClick={clickable ? onOpen : undefined}
    >
      <div className="job-row-main" style={{ display: 'block' }}>
        <b style={{ fontSize: 14 }}>{p.driverName || 'No driver recorded'}</b>
        <div className="job-cust">
          {dates}
          {dur ? ` · ${dur}` : ''}
        </div>
        {p.driverPhone ? (
          <div className="muted" style={{ fontSize: 12 }}>
            {p.driverPhone}
          </div>
        ) : null}
        {p.notes ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Note: {p.notes}
          </div>
        ) : null}
        {p.returnNotes ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Return note: {p.returnNotes}
          </div>
        ) : null}
      </div>
      <span className={`badge ${badge[0]}`}>{badge[1]}</span>
    </div>
  );
}

function VehiclePhotos({ vehicleId, isCompanyCar }: { vehicleId: string; isCompanyCar: boolean }) {
  const { data, loading } = useAsync(
    () => api.getOr<FleetPhoto[]>(`/fleet/photos?vehicleId=${vehicleId}`, []),
    [vehicleId],
  );
  const photos = data ?? [];
  const title = isCompanyCar ? 'Photos' : 'Report card';
  return (
    <>
      <SectionHeader>{title}</SectionHeader>
      <div className="card" style={{ marginBottom: 12 }}>
        {loading ? (
          <Loading />
        ) : photos.length === 0 ? (
          <span className="muted" style={{ fontSize: 13 }}>
            No photos yet.
          </span>
        ) : (
          <div className="photo-grid">
            {photos.map((ph) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={ph.id}
                className="photo-thumb"
                src={`/api/backend/fleet/photos/${ph.id}/content`}
                alt={ph.photoType}
                title={ph.photoType}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(from: string | null | undefined, to: string | null | undefined): string {
  if (!from || !to) return '';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const mins = Math.round(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const m = mins % 60;
  return hours > 0 ? `${hours}h ${m}m` : `${m}m`;
}

export default function FleetHistoryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CarRecord />
    </Suspense>
  );
}
