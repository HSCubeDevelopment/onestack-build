'use client';
import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Clock } from 'lucide-react';
import {
  api,
  ApiError,
  ClockStatus,
  DirectoryEntry,
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

  const toggle = async () => {
    setBusy(true);
    setActionErr(null);
    try {
      await api.post(status?.onClock ? '/time-clock/check-out' : '/time-clock/check-in');
      reload();
      reloadEntries();
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

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
              background: onClock ? 'var(--green-soft)' : 'var(--panel-2, var(--panel))',
              color: onClock ? 'var(--green)' : 'var(--text-dim)',
            }}
          >
            <Clock size={20} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{onClock ? 'On the clock' : 'Not checked in'}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              {onClock && status?.entry
                ? `Since ${fmtTime(status.entry.clockInAt)}`
                : 'Press check in to start a session'}
            </div>
          </div>
          <button
            className={`btn ${onClock ? 'dark' : 'primary'}`}
            disabled={busy}
            onClick={toggle}
          >
            {onClock ? <LogOut size={16} /> : <LogIn size={16} />}
            {onClock ? 'Check out' : 'Check in'}
          </button>
        </div>
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
