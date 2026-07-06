'use client';
import { useState } from 'react';
import { api, ApiError, Booking, Resource, WorkItem } from '@/lib/api';
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PageHead,
  useAsync,
} from '@/components/ui';

const DAY_START = 7; // 07:00
const DAY_END = 18; // 18:00
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
const ROW_H = 44; // px per hour

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function dayRange(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Fractional hours from midnight, for vertical placement. */
function hoursFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

export default function CalendarPage() {
  const [date, setDate] = useState(todayStr());

  const resourcesQ = useAsync(() => api.get<Resource[]>('/resources'), []);
  const range = dayRange(date);
  const bookingsQ = useAsync(
    () => api.get<Booking[]>(`/bookings?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
    [range.from, range.to],
  );
  const jobsQ = useAsync(() => api.get<WorkItem[]>('/work-items?type=job'), []);

  const [showResource, setShowResource] = useState(false);
  const [bookingModal, setBookingModal] = useState<{ open: boolean; resourceId?: string; hour?: number }>(
    { open: false },
  );
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);

  const resources = resourcesQ.data ?? [];
  const bookings = bookingsQ.data ?? [];
  const jobs = jobsQ.data ?? [];

  async function deleteResource(r: Resource) {
    if (!confirm(`Delete ${r.name}? This also removes its bookings.`)) return;
    try {
      await api.del(`/resources/${r.id}?force=true`);
      await Promise.all([resourcesQ.reload(), bookingsQ.reload()]);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <PageHead title="Calendar" sub="Scheduling for bays & technicians">
        <button className="btn" onClick={() => setShowResource(true)}>
          + Add resource
        </button>
        <button
          className="btn primary"
          disabled={resources.length === 0}
          onClick={() => setBookingModal({ open: true })}
        >
          + Booking
        </button>
      </PageHead>

      <ErrorBanner message={resourcesQ.error ?? bookingsQ.error} />

      {/* Resources */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ marginBottom: resources.length ? 12 : 0 }}>
          <h3>Resources</h3>
        </div>
        {resourcesQ.loading ? (
          <Loading />
        ) : resources.length === 0 ? (
          <EmptyState>Add a bay or technician to start scheduling.</EmptyState>
        ) : (
          <div className="pill-row">
            {resources.map((r) => (
              <span key={r.id} className={`badge ${r.type === 'bay' ? 'blue' : 'purple'}`}>
                {r.name}
                <button
                  className="link-btn"
                  style={{ color: 'inherit', marginLeft: 2 }}
                  title="Delete"
                  onClick={() => deleteResource(r)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Day view */}
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <h3>Day view</h3>
          <div className="spacer" />
          <input
            type="date"
            className="input"
            style={{ width: 'auto' }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {resources.length === 0 ? (
          <EmptyState>Add a bay or technician first.</EmptyState>
        ) : bookingsQ.loading ? (
          <Loading />
        ) : (
          <DayGrid
            resources={resources}
            bookings={bookings}
            onEmptyClick={(resourceId, hour) => setBookingModal({ open: true, resourceId, hour })}
            onBookingClick={(b) => setViewBooking(b)}
          />
        )}
      </div>

      {showResource && (
        <ResourceModal
          onClose={() => setShowResource(false)}
          onSaved={async () => {
            setShowResource(false);
            await resourcesQ.reload();
          }}
        />
      )}

      {bookingModal.open && (
        <BookingModal
          resources={resources}
          jobs={jobs}
          date={date}
          defaultResourceId={bookingModal.resourceId}
          defaultHour={bookingModal.hour}
          onClose={() => setBookingModal({ open: false })}
          onSaved={async () => {
            setBookingModal({ open: false });
            await bookingsQ.reload();
          }}
        />
      )}

      {viewBooking && (
        <BookingDetailModal
          booking={viewBooking}
          resources={resources}
          onClose={() => setViewBooking(null)}
          onDeleted={async () => {
            setViewBooking(null);
            await bookingsQ.reload();
          }}
        />
      )}
    </>
  );
}

function DayGrid({
  resources,
  bookings,
  onEmptyClick,
  onBookingClick,
}: {
  resources: Resource[];
  bookings: Booking[];
  onEmptyClick: (resourceId: string, hour: number) => void;
  onBookingClick: (b: Booking) => void;
}) {
  const totalHeight = (DAY_END - DAY_START) * ROW_H;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', minWidth: 'fit-content' }}>
        {/* hour gutter */}
        <div style={{ width: 52, flex: '0 0 52px' }}>
          <div style={{ height: 30 }} />
          <div style={{ position: 'relative', height: totalHeight }}>
            {HOURS.slice(0, -1).map((h, i) => (
              <div
                key={h}
                className="faint"
                style={{ position: 'absolute', top: i * ROW_H - 7, right: 8, fontSize: 11 }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {resources.map((r) => {
          const rBookings = bookings.filter((b) => b.resourceId === r.id);
          return (
            <div key={r.id} style={{ flex: '1 0 160px', minWidth: 160, borderLeft: '1px solid var(--border)' }}>
              <div
                className="row"
                style={{ height: 30, justifyContent: 'center', fontWeight: 600, fontSize: 12 }}
              >
                {r.name}
              </div>
              <div style={{ position: 'relative', height: totalHeight }}>
                {/* hour lines / clickable slots */}
                {HOURS.slice(0, -1).map((h, i) => (
                  <div
                    key={h}
                    onClick={() => onEmptyClick(r.id, h)}
                    title="New booking"
                    style={{
                      position: 'absolute',
                      top: i * ROW_H,
                      left: 0,
                      right: 0,
                      height: ROW_H,
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
                {/* bookings */}
                {rBookings.map((b) => {
                  const top = (hoursFromMidnight(b.startsAt) - DAY_START) * ROW_H;
                  const height = Math.max(
                    18,
                    (hoursFromMidnight(b.endsAt) - hoursFromMidnight(b.startsAt)) * ROW_H,
                  );
                  return (
                    <div
                      key={b.id}
                      className="job-card"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBookingClick(b);
                      }}
                      style={{
                        position: 'absolute',
                        top: Math.max(0, top),
                        left: 3,
                        right: 3,
                        height,
                        overflow: 'hidden',
                        padding: '5px 8px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {b.title}
                      </div>
                      <div className="faint" style={{ fontSize: 11 }}>
                        {hhmm(b.startsAt)}–{hhmm(b.endsAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResourceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'bay' | 'technician'>('bay');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      await api.post<Resource>('/resources', { type, name: name.trim() });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add resource" onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Type
          <select className="select" value={type} onChange={(e) => setType(e.target.value as 'bay' | 'technician')}>
            <option value="bay">Bay</option>
            <option value="technician">Technician</option>
          </select>
        </label>
        <label className="field">
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bay 1" />
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving || !name.trim()} onClick={save}>
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}

function defaultDateTime(date: string, hour: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hour, 0, 0, 0);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function BookingModal({
  resources,
  jobs,
  date,
  defaultResourceId,
  defaultHour,
  onClose,
  onSaved,
}: {
  resources: Resource[];
  jobs: WorkItem[];
  date: string;
  defaultResourceId?: string;
  defaultHour?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const startHour = defaultHour ?? 9;
  const [title, setTitle] = useState('');
  const [resourceId, setResourceId] = useState(defaultResourceId ?? resources[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState(defaultDateTime(date, startHour));
  const [endsAt, setEndsAt] = useState(defaultDateTime(date, startHour + 1));
  const [workItemId, setWorkItemId] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [clash, setClash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(allowOverlap: boolean) {
    setErr(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        resourceId,
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      };
      if (workItemId) body.workItemId = workItemId;
      if (notes.trim()) body.notes = notes.trim();
      if (allowOverlap) body.allowOverlap = true;
      await api.post<Booking>('/bookings', body);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setClash(e.message);
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New booking" onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        {clash && (
          <div className="err">
            ⚠ {clash}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" disabled={saving} onClick={() => submit(true)}>
                Book anyway
              </button>
            </div>
          </div>
        )}
        <label className="field">
          Title
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Front bumper repair" />
        </label>
        <label className="field">
          Resource
          <select className="select" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.type})
              </option>
            ))}
          </select>
        </label>
        <div className="grid cols-2">
          <label className="field">
            Start
            <input
              type="datetime-local"
              className="input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="field">
            End
            <input
              type="datetime-local"
              className="input"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          Link to job (optional)
          <select className="select" value={workItemId} onChange={(e) => setWorkItemId(e.target.value)}>
            <option value="">— None —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.reference}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Notes
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !title.trim() || !resourceId || !startsAt || !endsAt}
            onClick={() => submit(false)}
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BookingDetailModal({
  booking,
  resources,
  onClose,
  onDeleted,
}: {
  booking: Booking;
  resources: Resource[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const resource = resources.find((r) => r.id === booking.resourceId);

  async function remove() {
    if (!confirm('Delete this booking?')) return;
    setErr(null);
    setDeleting(true);
    try {
      await api.del(`/bookings/${booking.id}`);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title={booking.title} onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <div className="row">
          <span className="muted">Resource</span>
          <div className="spacer" />
          <strong>{resource?.name ?? booking.resourceId}</strong>
        </div>
        <div className="row">
          <span className="muted">Time</span>
          <div className="spacer" />
          <strong>
            {hhmm(booking.startsAt)}–{hhmm(booking.endsAt)}
          </strong>
        </div>
        {booking.notes && (
          <div>
            <span className="muted">Notes</span>
            <div>{booking.notes}</div>
          </div>
        )}
        <div className="row">
          <button className="btn danger" disabled={deleting} onClick={remove}>
            Delete booking
          </button>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
