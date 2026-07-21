'use client';
import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Clock, MapPin } from 'lucide-react';
import {
  api,
  ApiError,
  asGeofenceRefusal,
  ClockStatus,
  DirectoryEntry,
  getBrowserPosition,
  hoursLabel,
  StaffTotal,
  TimeEntry,
} from '@/lib/api';
import { ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

interface Me {
  userId: string;
  role: 'OWNER' | 'STAFF';
  signedIn: boolean;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });

export default function TimeClockPage() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  const {
    data: status,
    loading,
    error,
    reload,
  } = useAsync(() => api.get<ClockStatus>('/time-clock/status'), []);
  const { data: entries, reload: reloadEntries } = useAsync(
    () => api.get<TimeEntry[]>('/time-clock/entries'),
    [],
  );

  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  // When the fence refuses (off-site / no GPS), the API says the check-in CAN be overridden with a
  // reason. We hold that prompt here rather than dead-ending, mirroring the mobile flow.
  const [override, setOverride] = useState<{ message: string } | null>(null);
  const [locating, setLocating] = useState(false);

  /**
   * Check in through the geofence (card 53.1). Ask the browser where it is, send that; if the fence
   * refuses but allows an override, surface the reason prompt instead of a dead error. A refusal is a
   * normal outcome here, not a failure — a flat GPS chip must not cost someone their shift.
   */
  const checkIn = async (overrideReason?: string) => {
    setBusy(true);
    setActionErr(null);
    try {
      setLocating(!overrideReason);
      const position = await getBrowserPosition();
      setLocating(false);
      await api.post('/time-clock/check-in', {
        position: position ?? undefined,
        overrideReason,
      });
      setOverride(null);
      reload();
      reloadEntries();
    } catch (e) {
      const refusal = e instanceof ApiError ? asGeofenceRefusal(e.body) : null;
      if (refusal?.canOverride) {
        setOverride({ message: refusal.message });
      } else {
        setActionErr(e instanceof ApiError ? e.message : 'Check-in failed');
      }
    } finally {
      setBusy(false);
      setLocating(false);
    }
  };

  const checkOut = async () => {
    setBusy(true);
    setActionErr(null);
    try {
      await api.post('/time-clock/check-out');
      reload();
      reloadEntries();
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : 'Check-out failed');
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => (status?.onClock ? void checkOut() : void checkIn());

  const onClock = status?.onClock ?? false;

  return (
    <>
      <PageHead title="Time clock" sub="Check in when you start, check out when you leave.">
        {me ? (
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            Signed in as <strong>{me.role}</strong>
          </span>
        ) : null}
      </PageHead>

      <ErrorBanner message={error || actionErr} />

      {loading && !status ? (
        <Loading />
      ) : onClock && status?.entry ? (
        <ClockedInCard entry={status.entry} busy={busy} onToggle={toggle} />
      ) : (
        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 16, maxWidth: 520 }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--panel-2)',
              color: 'var(--text-dim)',
            }}
          >
            <Clock size={20} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Not checked in</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              {locating ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <MapPin size={13} /> Checking you’re on site…
                </span>
              ) : (
                'Check-in confirms you’re at the workshop.'
              )}
            </div>
          </div>
          <button className="btn primary" disabled={busy} onClick={toggle}>
            <LogIn size={16} />
            {locating ? 'Locating…' : 'Check in'}
          </button>
        </div>
      )}

      {/* Off-site or no GPS: the fence refused but allows an explained exception. This is the path that
          keeps a flat GPS chip from costing someone their shift — the reason lands in the owner queue. */}
      {override && !onClock && (
        <OverridePrompt
          message={override.message}
          busy={busy}
          onCancel={() => setOverride(null)}
          onSubmit={(reason) => void checkIn(reason)}
        />
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>My recent sessions</h2>
        {entries && entries.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Checked in</th>
                <th>Checked out</th>
                <th style={{ textAlign: 'right' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{fmtTime(e.clockInAt)}</td>
                  <td>
                    {e.clockOutAt ? (
                      fmtTime(e.clockOutAt)
                    ) : (
                      <em style={{ color: 'var(--green)' }}>on the clock</em>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {e.minutes != null ? hoursLabel(e.minutes) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>No sessions yet.</p>
        )}
      </section>

      {me?.role === 'OWNER' ? <AdminHours /> : null}
    </>
  );
}

/**
 * The clocked-in card, matched to the prototype's teal shift card: a big running total, and a bar
 * that fills toward a nominal 8-hour shift so a glance says "how far through the day am I".
 *
 * The elapsed time is computed at render from the check-in timestamp — no live ticking, but it is
 * exact each time the page loads or an action reloads it, and it never invents a GPS/on-site state the
 * web check-in doesn't actually capture (that lives on the mobile geofenced check-in).
 */
const SHIFT_MINUTES = 8 * 60;

function ClockedInCard({
  entry,
  busy,
  onToggle,
}: {
  entry: TimeEntry;
  busy: boolean;
  onToggle: () => void;
}) {
  const elapsedMin = Math.max(
    0,
    Math.round((Date.now() - new Date(entry.clockInAt).getTime()) / 60000),
  );
  const pct = Math.min(100, Math.round((elapsedMin / SHIFT_MINUTES) * 100));

  return (
    <div
      className="card"
      style={{
        maxWidth: 520,
        background: 'linear-gradient(135deg, #0b3b34, #12a594)',
        color: '#fff',
        border: 'none',
      }}
    >
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#bff5ec' }}>
            ON THE CLOCK
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, margin: '2px 0 0' }}>
            {hoursLabel(elapsedMin)}
          </div>
          <div style={{ fontSize: 12.5, color: '#bff5ec' }}>
            since {fmtTime(entry.clockInAt)} · of an 8h shift
          </div>
        </div>
        <button
          className="btn dark"
          disabled={busy}
          onClick={onToggle}
          style={{ background: 'rgba(0,0,0,0.25)', borderColor: 'transparent' }}
        >
          <LogOut size={16} /> Check out
        </button>
      </div>
      <div
        style={{
          height: 8,
          background: 'rgba(255,255,255,0.25)',
          borderRadius: 999,
          marginTop: 14,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: '#fff', borderRadius: 999 }} />
      </div>
    </div>
  );
}

/**
 * The override path. The fence said no — off-site, or the phone gave no fix — but a check-in isn't a
 * dead end: type why, and it's recorded for the owner to review rather than silently blocked. The
 * reason is required (the API rejects an empty one), which is what keeps the review queue meaningful.
 */
function OverridePrompt({
  message,
  busy,
  onCancel,
  onSubmit,
}: {
  message: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 12, borderColor: 'var(--amber)' }}>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <MapPin size={16} style={{ color: 'var(--amber)' }} />
        <b>{message}</b>
      </div>
      <label className="field">
        Reason for checking in anyway
        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. picking up a car from the tow yard"
        />
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button className="btn ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy || reason.trim().length < 4}
          onClick={() => onSubmit(reason.trim())}
        >
          Check in anyway
        </button>
      </div>
    </div>
  );
}

/** OWNER-only: hours logged per staff member, with names resolved from the directory. */
function AdminHours() {
  const load = useCallback(
    () =>
      Promise.all([
        api.get<StaffTotal[]>('/time-clock/summary'),
        api.get<DirectoryEntry[]>('/auth/directory'),
      ]),
    [],
  );
  const { data, loading, error } = useAsync(load, []);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBanner message={error} />;
  const [totals, directory] = data ?? [[], []];
  const emailFor = new Map(directory.map((d) => [d.userId, d.email]));

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Hours logged — all staff</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Staff</th>
            <th>Role</th>
            <th style={{ textAlign: 'right' }}>Sessions</th>
            <th style={{ textAlign: 'right' }}>Total hours</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.userId}>
              <td>{emailFor.get(t.userId) ?? `${t.userId.slice(0, 8)}…`}</td>
              <td>{t.role ?? '—'}</td>
              <td style={{ textAlign: 'right' }}>{t.sessions}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{hoursLabel(t.totalMinutes)}</td>
              <td>
                {t.onClock ? (
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>● on the clock</span>
                ) : (
                  <span style={{ color: 'var(--text-faint)' }}>off</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
