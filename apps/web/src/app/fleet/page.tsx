'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { EmptyState, ErrorBanner, Modal, PageHead, useAsync } from '@/components/ui';
import { CarsBrowser } from '@/components/fleet/CarsBrowser';
import {
  BOND_OPTIONS,
  FleetDashboardStats,
  FleetSearchResults,
  FleetVehicle,
  PURPOSE_OPTIONS,
  localInputToISO,
  nowLocalInputValue,
  purposeLabel,
} from '@/lib/fleet';

export default function FleetPage() {
  const router = useRouter();
  const stats = useAsync(() => api.get<FleetDashboardStats>('/fleet/dashboard'), []);
  const vehicles = useAsync(() => api.get<FleetVehicle[]>('/fleet/vehicles'), []);
  const [newMovement, setNewMovement] = useState(false);
  const [recordReturn, setRecordReturn] = useState(false);

  const reloadAll = () => {
    stats.reload();
    vehicles.reload();
  };

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

      {/*
        No tile grid. The In N Out cars screen carries its numbers in the filter chips (All /
        Available / Out / Returned today / Booked), which is where they are actually useful — next to
        the control that applies them. Only two figures have no chip to live in, so they get one
        muted line instead of seven boxes.
      */}
      {s && (s.goingOutToday > 0 || s.overdue > 0) ? (
        <div className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
          {s.goingOutToday > 0 ? `${s.goingOutToday} going out today` : null}
          {s.goingOutToday > 0 && s.overdue > 0 ? ' \u00b7 ' : null}
          {s.overdue > 0 ? `${s.overdue} overdue` : null}
        </div>
      ) : null}

      {s && s.overdue > 0 ? (
        <div className="notif" style={{ marginBottom: 12 }}>
          ⚠️ {s.overdue} loan car{s.overdue === 1 ? '' : 's'} overdue —{' '}
          {s.overdue === 1 ? 'it is' : 'they are'} out past the expected return. Chase the driver or
          record the return.
        </div>
      ) : null}

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

      <CarsBrowser
        vehicles={vehicles.data ?? []}
        loading={vehicles.loading}
        error={vehicles.error}
      />

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
          <select
            className="select"
            value={bondStatus}
            onChange={(e) => setBondStatus(e.target.value)}
            aria-label="Bond status"
          >
            <option value="">Bond status…</option>
            {BOND_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
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
