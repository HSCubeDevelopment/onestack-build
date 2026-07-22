'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Square } from 'lucide-react';
import {
  api,
  ApiError,
  asGeofenceRefusal,
  ClockStatus,
  getBrowserPosition,
  hoursLabel,
  TimeEntry,
} from '@/lib/api';
import { AtTopbar, Toast } from '@/components/autotech/kit';

/**
 * Clock In / Out — the Auto Tech shift clock. Big circle toggles the shift; a live wall clock ticks
 * above; Today / This week / This fortnight are summed client-side from the user's own entries.
 *
 * Wired to the real time-clock API (no API change): status / check-in / check-out / entries. GPS is a
 * soft gate — a refusal that `canOverride` prompts for a short reason and re-submits, so the geofence
 * the owner configured is preserved even though the demo's clock never mentions it.
 */
export function ClockInOut({ backHref = '/' }: { backHref?: string }) {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [override, setOverride] = useState<{ message: string } | null>(null);
  const [reason, setReason] = useState('');
  const [locating, setLocating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, e] = await Promise.all([
      api.get<ClockStatus>('/time-clock/status'),
      api.getOr<TimeEntry[]>('/time-clock/entries', []),
    ]);
    setStatus(s);
    setEntries(e);
  }, []);

  useEffect(() => {
    load().catch(() => setErr('Could not load your clock'));
  }, [load]);

  // Live wall clock + running open-session elapsed.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const onClock = status?.onClock ?? false;

  const checkIn = useCallback(
    async (overrideReason?: string) => {
      setBusy(true);
      setErr(null);
      try {
        setLocating(!overrideReason);
        const position = await getBrowserPosition();
        setLocating(false);
        await api.post('/time-clock/check-in', {
          position: position ?? undefined,
          overrideReason,
        });
        setOverride(null);
        setReason('');
        setToast('Clocked in ✓');
        await load();
      } catch (e) {
        const refusal = e instanceof ApiError ? asGeofenceRefusal(e.body) : null;
        if (refusal?.canOverride) setOverride({ message: refusal.message });
        else setErr(e instanceof ApiError ? e.message : 'Could not clock in');
      } finally {
        setLocating(false);
        setBusy(false);
      }
    },
    [load],
  );

  const checkOut = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/time-clock/check-out');
      setToast('Clocked out ✓');
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not clock out');
    } finally {
      setBusy(false);
    }
  }, [load]);

  const bucket = (startMs: number) => {
    let mins = 0;
    for (const e of entries) {
      const inMs = new Date(e.clockInAt).getTime();
      if (isNaN(inMs) || inMs < startMs) continue;
      mins += e.minutes ?? Math.max(0, Math.round((now - inMs) / 60000));
    }
    return mins;
  };

  const d = new Date(now);
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Monday-based week start.
  const dow = (d.getDay() + 6) % 7;
  const startOfWeek = startOfToday - dow * 864e5;
  const startOfFortnight = startOfWeek - 7 * 864e5;

  const clockDay = d.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const wallTime = d
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  const sinceTime = status?.entry
    ? new Date(status.entry.clockInAt)
        .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
        .toLowerCase()
    : '';

  return (
    <>
      <AtTopbar backHref={backHref} />
      <div className="at-h2">Clock In / Out</div>

      {err && <div className="at-errbanner">{err}</div>}

      <div className="at-clockwrap">
        <div className="at-clockday">{clockDay}</div>
        <div className="at-clocktime">{wallTime}</div>

        <button
          className={`at-bigcirc ${onClock ? 'at-circ-out' : 'at-circ-in'}`}
          disabled={busy}
          onClick={() => (onClock ? void checkOut() : void checkIn())}
        >
          {onClock ? (
            <Square size={62} strokeWidth={2} />
          ) : (
            <CheckCircle2 size={66} strokeWidth={2} />
          )}
          <span className="ct">
            {locating ? 'Locating…' : busy ? '…' : onClock ? 'Clock Out' : 'Clock In'}
          </span>
        </button>

        <div className="at-statusline">
          {onClock ? (
            <>
              On shift since <b>{sinceTime}</b>
            </>
          ) : (
            'Not started yet'
          )}
        </div>
      </div>

      {override && (
        <div className="at-warn" style={{ flexDirection: 'column', marginTop: 20 }}>
          <div className="wt">Can&apos;t confirm you&apos;re on-site</div>
          <div style={{ marginBottom: 8 }}>{override.message}</div>
          <input
            className="at-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. GPS off, working off-site)"
          />
          <button
            className="at-btn primary"
            style={{ marginTop: 10 }}
            disabled={busy || reason.trim().length < 4}
            onClick={() => void checkIn(reason.trim())}
          >
            Clock in anyway
          </button>
        </div>
      )}

      <div className="at-hoursbox">
        <div className="at-hoursrow">
          <span>Today</span>
          <span>{hoursLabel(bucket(startOfToday))}</span>
        </div>
        <div className="at-hoursrow">
          <span>This week</span>
          <span>{hoursLabel(bucket(startOfWeek))}</span>
        </div>
        <div className="at-hoursrow">
          <span>This fortnight</span>
          <span>{hoursLabel(bucket(startOfFortnight))}</span>
        </div>
      </div>

      <Toast message={toast} />
    </>
  );
}
