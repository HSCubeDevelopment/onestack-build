'use client';
import { useMemo, useState } from 'react';
import { api, Shift } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';
import { useRole } from '@/lib/use-role';

export default function RosterPage() {
  const { isStaff } = useRole();
  const range = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const { data, loading, error, reload } = useAsync(
    () =>
      api.get<Shift[]>(
        `/shifts?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
    [],
  );
  const [adding, setAdding] = useState(false);
  const shifts = data ?? [];
  const byDay = groupByDay(shifts);

  const remove = async (id: string) => {
    if (!confirm('Remove this roster entry?')) return;
    await api.del(`/shifts/${id}`);
    reload();
  };

  return (
    <>
      <PageHead title="Roster" sub="Shifts, availability and time-off (next 14 days)">
        {/* Employees read the roster; only an owner writes it. POST/DELETE /shifts are OWNER-only, so
            these controls would 403 on click — don't offer them. */}
        {isStaff ? null : (
          <button className="btn primary" onClick={() => setAdding(true)}>
            + Add shift
          </button>
        )}
      </PageHead>

      <ErrorBanner message={error} />

      {loading ? (
        <Loading />
      ) : shifts.length === 0 ? (
        <div className="card">
          <EmptyState>No shifts scheduled in the next two weeks.</EmptyState>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {byDay.map(([day, items]) => (
            <div className="card" key={day}>
              <div className="lbl2" style={{ marginBottom: 4 }}>
                {day.toUpperCase()}
              </div>
              {items.map((s) => (
                <div className="job-row" key={s.id}>
                  <div className="job-row-main">
                    <span
                      className="status-pill"
                      style={{
                        background: s.kind === 'time_off' ? 'var(--text-dim)' : 'var(--cyan)',
                      }}
                    >
                      {time(s.startsAt)}–{time(s.endsAt)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{s.staffName}</b>
                      <div className="job-cust">
                        {s.kind === 'time_off' ? 'Time off' : 'Shift'}
                        {s.notes ? ` · ${s.notes}` : ''}
                      </div>
                    </div>
                  </div>
                  {isStaff ? null : (
                    <button className="btn sm" onClick={() => remove(s.id)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <AddModal
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

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [staffName, setStaffName] = useState('');
  const [kind, setKind] = useState<'shift' | 'time_off'>('shift');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/shifts', {
        staffName,
        kind,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        notes: notes || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add to roster" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          className="input"
          placeholder="Staff name"
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
        />
        <select
          className="input"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'shift' | 'time_off')}
        >
          <option value="shift">Shift</option>
          <option value="time_off">Time off</option>
        </select>
        <label className="muted" style={{ fontSize: 13 }}>
          Start
        </label>
        <input
          className="input"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        <label className="muted" style={{ fontSize: 13 }}>
          End
        </label>
        <input
          className="input"
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
        <input
          className="input"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={busy || !staffName.trim() || !startsAt || !endsAt}
          >
            {busy ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function groupByDay(shifts: Shift[]): [string, Shift[]][] {
  const map = new Map<string, Shift[]>();
  for (const s of shifts) {
    const day = new Date(s.startsAt).toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
    const arr = map.get(day) ?? [];
    arr.push(s);
    map.set(day, arr);
  }
  return [...map.entries()];
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}
