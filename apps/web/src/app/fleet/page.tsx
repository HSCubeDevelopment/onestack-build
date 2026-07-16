'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';
import {
  FleetDashboardStats,
  FleetSearchResults,
  FleetVehicle,
  FleetVehicleStatus,
  PURPOSE_OPTIONS,
  localInputToISO,
  nowLocalInputValue,
  purposeLabel,
  vehicleStatusColor,
  vehicleStatusLabel,
} from '@/lib/fleet';

const STATUS_FILTERS: (FleetVehicleStatus | 'all')[] = [
  'all',
  'available',
  'out',
  'booked',
  'repair',
];

export default function FleetPage() {
  const router = useRouter();
  const stats = useAsync(() => api.get<FleetDashboardStats>('/fleet/dashboard'), []);
  const vehicles = useAsync(() => api.get<FleetVehicle[]>('/fleet/vehicles'), []);
  const [filter, setFilter] = useState<FleetVehicleStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [newMovement, setNewMovement] = useState(false);
  const [recordReturn, setRecordReturn] = useState(false);

  const reloadAll = () => {
    stats.reload();
    vehicles.reload();
  };

  const shown = useMemo(() => {
    const term = q.trim().toUpperCase();
    return (vehicles.data ?? [])
      .filter((v) => (filter === 'all' ? true : v.status === filter))
      .filter((v) =>
        term
          ? v.rego.includes(term) ||
            v.make.toUpperCase().includes(term) ||
            v.model.toUpperCase().includes(term)
          : true,
      );
  }, [vehicles.data, filter, q]);

  const s = stats.data;

  return (
    <>
      <PageHead
        title="Fleet & courtesy cars"
        sub="Loan-car movements, returns, bookings and availability"
      >
        <button className="btn" onClick={() => setRecordReturn(true)}>
          Record return
        </button>
        <button className="btn primary" onClick={() => setNewMovement(true)}>
          + New movement
        </button>
      </PageHead>

      <ErrorBanner message={stats.error || vehicles.error} />

      {/* Dashboard tiles */}
      <div
        className="grid cols-4"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatTile label="Cars out now" value={s?.carsOut} tone="red" />
        <StatTile label="Available" value={s?.availableCars} tone="green" />
        <StatTile label="Booked" value={s?.bookedCars} tone="amber" />
        <StatTile label="Returned today" value={s?.returnedToday} />
        <StatTile label="Going out today" value={s?.goingOutToday} />
        <StatTile
          label="Overdue"
          value={s?.overdue}
          tone={s && s.overdue > 0 ? 'red' : undefined}
        />
        <StatTile
          label="Needs review"
          value={s?.needsAttention}
          tone={s && s.needsAttention > 0 ? 'amber' : undefined}
        />
      </div>

      {s && s.needsAttention > 0 ? (
        <div
          className="card"
          style={{
            padding: '12px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span className="muted">{s.needsAttention} record(s) need a quick human check.</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button
            className="btn sm"
            onClick={async () => {
              if (!confirm('Mark all flagged records as reviewed?')) return;
              await api.post('/fleet/review/clear');
              reloadAll();
            }}
          >
            Mark all reviewed
          </button>
        </div>
      ) : null}

      {/* Availability + search */}
      <div className="card pad0">
        <div className="row" style={{ padding: '12px 18px', gap: 12, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Search rego, make, model…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          <div className="spacer" style={{ flex: 1 }} />
          <div className="row" style={{ gap: 6 }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                className={`btn sm ${filter === f ? 'primary' : 'ghost'}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : vehicleStatusLabel[f]}
              </button>
            ))}
          </div>
        </div>
        <div className="divider" />
        {vehicles.loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <EmptyState>No fleet cars match.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Rego</th>
                <th>Make / model</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.id}>
                  <td className="mono">{v.rego}</td>
                  <td>
                    {[v.make, v.model].filter(Boolean).join(' ') || (
                      <span className="muted">—</span>
                    )}
                    {v.vehicleType ? <span className="muted"> · {v.vehicleType}</span> : null}
                  </td>
                  <td>
                    <span className={`badge ${vehicleStatusColor[v.status]}`}>
                      {vehicleStatusLabel[v.status]}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn sm"
                      onClick={() =>
                        router.push(`/fleet/history?rego=${encodeURIComponent(v.rego)}`)
                      }
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SearchPanel />

      {newMovement ? (
        <NewMovementModal
          vehicles={vehicles.data ?? []}
          onClose={() => setNewMovement(false)}
          onDone={() => {
            setNewMovement(false);
            reloadAll();
          }}
        />
      ) : null}
      {recordReturn ? (
        <RecordReturnModal
          onClose={() => setRecordReturn(false)}
          onDone={() => {
            setRecordReturn(false);
            reloadAll();
          }}
        />
      ) : null}
    </>
  );
}

function StatTile({ label, value, tone }: { label: string; value?: number; tone?: string }) {
  const color =
    tone === 'red'
      ? 'var(--red, #be4152)'
      : tone === 'green'
        ? 'var(--green, #2f9e57)'
        : tone === 'amber'
          ? 'var(--amber, #b37d28)'
          : undefined;
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value ?? '—'}</div>
      <div className="muted" style={{ fontSize: 13 }}>
        {label}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ search

function SearchPanel() {
  const [term, setTerm] = useState('');
  const [res, setRes] = useState<FleetSearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = async () => {
    if (!term.trim()) {
      setRes(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRes(
        await api.get<FleetSearchResults>(`/fleet/search?q=${encodeURIComponent(term.trim())}`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const total = res
    ? res.movements.length + res.returns.length + res.vehicles.length + res.bookings.length
    : 0;

  return (
    <div className="card pad0" style={{ marginTop: 16 }}>
      <div className="row" style={{ padding: '12px 18px', gap: 10 }}>
        <input
          className="input"
          placeholder="Universal search — rego, name, mobile, purpose…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          style={{ flex: 1 }}
        />
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      <ErrorBanner message={error} />
      {res ? (
        <>
          <div className="divider" />
          {total === 0 ? (
            <EmptyState>No matches for “{term}”.</EmptyState>
          ) : (
            <table className="table">
              <tbody>
                {res.movements.map((m) => (
                  <tr
                    key={`m${m.id}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/fleet/movements/${m.id}`)}
                  >
                    <td>
                      <span className="badge blue">Movement</span>
                    </td>
                    <td className="mono">{m.carsOutRego || m.carsInRego || '—'}</td>
                    <td>
                      {m.driverName || '—'} · {purposeLabel(m.purpose)}
                    </td>
                  </tr>
                ))}
                {res.returns.map((r) => (
                  <tr key={`r${r.id}`}>
                    <td>
                      <span className="badge green">Return</span>
                    </td>
                    <td className="mono">{r.returnedRego || '—'}</td>
                    <td>{r.driverName || '—'}</td>
                  </tr>
                ))}
                {res.vehicles.map((v) => (
                  <tr key={`v${v.id}`}>
                    <td>
                      <span className="badge">Vehicle</span>
                    </td>
                    <td className="mono">{v.rego}</td>
                    <td>{[v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                  </tr>
                ))}
                {res.bookings.map((b) => (
                  <tr key={`b${b.id}`}>
                    <td>
                      <span className="badge amber">Booking</span>
                    </td>
                    <td className="mono">{b.vehicleRego || '—'}</td>
                    <td>{b.bookingName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ new movement

function NewMovementModal({
  vehicles,
  onClose,
  onDone,
}: {
  vehicles: FleetVehicle[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [carsInRego, setCarsInRego] = useState('');
  const [carsOutRego, setCarsOutRego] = useState('');
  const [purpose, setPurpose] = useState('COURTESY');
  const [movedAt, setMovedAt] = useState(nowLocalInputValue());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outClean = carsOutRego.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const conflict = vehicles.find(
    (v) => v.rego === outClean && (v.status === 'out' || v.status === 'booked'),
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/fleet/movements', {
        driverName,
        driverPhone,
        carsInRego: carsInRego || undefined,
        carsOutRego: carsOutRego || undefined,
        purpose,
        movedAt: localInputToISO(movedAt),
        notes,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="New movement — car in / loan car out" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder="Customer car rego (in)"
            value={carsInRego}
            onChange={(e) => setCarsInRego(e.target.value)}
          />
          <input
            className="input"
            placeholder="Fleet car rego (out)"
            value={carsOutRego}
            onChange={(e) => setCarsOutRego(e.target.value)}
          />
        </div>
        {conflict ? (
          <div className="err" style={{ fontSize: 13 }}>
            Heads up: {outClean} is currently {conflict.status}. You can still give it out.
          </div>
        ) : null}
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder="Driver name"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Driver mobile"
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
          />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <select className="select" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {PURPOSE_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="datetime-local"
            value={movedAt}
            onChange={(e) => setMovedAt(e.target.value)}
          />
        </div>
        <textarea
          className="input"
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={busy || (!carsInRego && !carsOutRego)}
          >
            {busy ? 'Saving…' : 'Save movement'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ record return

function RecordReturnModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [returnedRego, setReturnedRego] = useState('');
  const [driverName, setDriverName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [bondStatus, setBondStatus] = useState('');
  const [returnedAt, setReturnedAt] = useState(nowLocalInputValue());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!returnedRego.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/fleet/returns', {
        returnedRego,
        driverName: driverName || undefined,
        mobileNumber: mobileNumber || undefined,
        bondStatus: bondStatus || undefined,
        returnedAt: localInputToISO(returnedAt),
        notes,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Record return" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          className="input"
          placeholder="Returned fleet car rego"
          value={returnedRego}
          onChange={(e) => setReturnedRego(e.target.value)}
        />
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder="Driver name"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Mobile"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
          />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder="Bond status"
            value={bondStatus}
            onChange={(e) => setBondStatus(e.target.value)}
          />
          <input
            className="input"
            type="datetime-local"
            value={returnedAt}
            onChange={(e) => setReturnedAt(e.target.value)}
          />
        </div>
        <textarea
          className="input"
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy || !returnedRego.trim()}>
            {busy ? 'Saving…' : 'Record return'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
