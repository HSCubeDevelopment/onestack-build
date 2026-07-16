'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';
import {
  FleetBooking,
  PURPOSE_OPTIONS,
  bookingStatusColor,
  bookingStatusLabel,
  formatDateTime,
  localInputToISO,
  nowLocalInputValue,
} from '@/lib/fleet';

const isOverdue = (b: FleetBooking) =>
  b.status === 'active' && !!b.expectedReturnAt && new Date(b.expectedReturnAt) < new Date();

export default function FleetBookingsPage() {
  const [showAll, setShowAll] = useState(false);
  const q = showAll ? '?status=booked,active,completed,cancelled' : '?status=booked,active';
  const { data, loading, error, reload } = useAsync(
    () => api.get<FleetBooking[]>(`/fleet/bookings${q}`),
    [showAll],
  );
  const [adding, setAdding] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    reload();
  };

  return (
    <>
      <PageHead title="Fleet bookings" sub="Reserve a courtesy car for a customer">
        <button className="btn primary" onClick={() => setAdding(true)}>
          + New booking
        </button>
      </PageHead>

      <ErrorBanner message={error} />

      <div className="card pad0">
        <div className="row" style={{ padding: '12px 18px' }}>
          <label className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            <span className="muted">Show completed &amp; cancelled</span>
          </label>
        </div>
        <div className="divider" />
        {loading ? (
          <Loading />
        ) : (data ?? []).length === 0 ? (
          <EmptyState>No bookings yet.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Car</th>
                <th>Customer</th>
                <th>From</th>
                <th>Expected back</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((b) => (
                <tr
                  key={b.id}
                  style={
                    isOverdue(b)
                      ? { background: 'color-mix(in srgb, var(--red, #be4152) 8%, transparent)' }
                      : undefined
                  }
                >
                  <td className="mono">{b.vehicleRego || '—'}</td>
                  <td>
                    {b.bookingName || '—'}
                    {b.bookingMobile ? <span className="muted"> · {b.bookingMobile}</span> : null}
                  </td>
                  <td className="muted">{formatDateTime(b.startAt)}</td>
                  <td className="muted">
                    {formatDateTime(b.expectedReturnAt)}
                    {isOverdue(b) ? (
                      <span style={{ color: 'var(--red, #be4152)' }}> · overdue</span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`badge ${bookingStatusColor[b.status]}`}>
                      {bookingStatusLabel[b.status]}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {b.status === 'booked' || b.status === 'active' ? (
                      <>
                        <button
                          className="btn sm"
                          onClick={() => act(() => api.post(`/fleet/bookings/${b.id}/convert`))}
                          title="The car is going out now"
                        >
                          Convert to movement
                        </button>{' '}
                        <button
                          className="btn sm danger"
                          onClick={() => {
                            if (confirm('Cancel this booking?'))
                              act(() => api.post(`/fleet/bookings/${b.id}/cancel`));
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding ? (
        <AddBookingModal
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function AddBookingModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [vehicleRego, setVehicleRego] = useState('');
  const [bookingName, setBookingName] = useState('');
  const [bookingMobile, setBookingMobile] = useState('');
  const [startAt, setStartAt] = useState(nowLocalInputValue());
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [purpose, setPurpose] = useState('COURTESY');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!vehicleRego.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/fleet/bookings', {
        vehicleRego,
        bookingName: bookingName || undefined,
        bookingMobile: bookingMobile || undefined,
        startAt: localInputToISO(startAt),
        expectedReturnAt: expectedReturnAt ? localInputToISO(expectedReturnAt) : undefined,
        purpose,
        notes,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="New booking" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          className="input"
          placeholder="Fleet car rego"
          value={vehicleRego}
          onChange={(e) => setVehicleRego(e.target.value)}
        />
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder="Customer name"
            value={bookingName}
            onChange={(e) => setBookingName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Mobile"
            value={bookingMobile}
            onChange={(e) => setBookingMobile(e.target.value)}
          />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Start
            </span>
            <input
              className="input"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Expected back
            </span>
            <input
              className="input"
              type="datetime-local"
              value={expectedReturnAt}
              onChange={(e) => setExpectedReturnAt(e.target.value)}
            />
          </label>
        </div>
        <select className="select" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {PURPOSE_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
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
          <button className="btn primary" onClick={save} disabled={busy || !vehicleRego.trim()}>
            {busy ? 'Saving…' : 'Create booking'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
