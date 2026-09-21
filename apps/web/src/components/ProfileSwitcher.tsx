'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, UserRound, X } from 'lucide-react';

interface Person {
  userId: string;
  name: string;
  role: 'OWNER' | 'STAFF' | 'TOW';
  site: string | null;
}

const ROLE_LABEL: Record<Person['role'], string> = {
  OWNER: 'Owner',
  STAFF: 'Employee',
  TOW: 'Tow driver',
};
const ROLE_ORDER: Person['role'][] = ['OWNER', 'STAFF', 'TOW'];

/**
 * Hop between profiles without signing out — for reviewing what each role actually sees.
 *
 * Renders NOTHING unless the server says PIN checks are off, and it asks on every mount rather than
 * caching: the moment PINs are switched back on, this disappears. It is only ever a shortcut to the
 * same `/auth/open-login` the sign-in screen uses, and that endpoint re-checks the gate itself — so
 * this component being present could never, on its own, get anyone in.
 */
export function ProfileSwitcher() {
  const [enabled, setEnabled] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<{ userId: string; role: Person['role'] } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const mode = (await (await fetch('/api/auth/mode')).json()) as { pinsRequired?: boolean };
        if (!live || mode.pinsRequired !== false) return;
        setEnabled(true);
        const [dir, who] = await Promise.all([
          fetch('/api/auth/pin-directory').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/me')
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (!live) return;
        if (Array.isArray(dir)) setPeople(dir as Person[]);
        if (who?.userId) setMe({ userId: who.userId, role: who.role });
      } catch {
        // Anything unexpected and the switcher simply does not appear.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const grouped = useMemo(
    () =>
      ROLE_ORDER.map((role) => ({
        role,
        members: people.filter((p) => p.role === role),
      })).filter((g) => g.members.length > 0),
    [people],
  );

  const current = people.find((p) => p.userId === me?.userId);

  async function become(p: Person) {
    setBusy(p.userId);
    setError(null);
    try {
      const res = await fetch('/api/auth/open-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: p.userId }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || 'Could not switch');
      }
      // Full reload, not a router push: the role lives in an httpOnly cookie the server layout reads,
      // so the whole shell has to be rebuilt to change surface.
      window.location.assign('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch');
      setBusy(null);
    }
  }

  if (!enabled || people.length === 0) return null;

  return (
    <div className="psw">
      {open && (
        <div className="psw-panel" role="dialog" aria-label="Switch profile">
          <div className="psw-head">
            <span>Sign in as…</span>
            <button onClick={() => setOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          {error && <div className="psw-err">{error}</div>}
          <div className="psw-scroll">
            {grouped.map((g) => (
              <div key={g.role}>
                <div className="psw-group">{ROLE_LABEL[g.role]}</div>
                {g.members.map((p) => (
                  <button
                    key={p.userId}
                    className={`psw-row${p.userId === me?.userId ? ' on' : ''}`}
                    disabled={busy !== null}
                    onClick={() => void become(p)}
                  >
                    <span className="n">{p.name}</span>
                    {p.site && <span className="s">{p.site.split(',')[0]}</span>}
                    {busy === p.userId && <span className="s">switching…</span>}
                    {p.userId === me?.userId && busy === null && <span className="s">current</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="psw-foot">
            PIN checks are off. Everyone&apos;s PIN is still stored and works again the moment they
            are switched back on.
          </div>
        </div>
      )}

      <button className="psw-pill" onClick={() => setOpen((v) => !v)}>
        <UserRound size={15} />
        <span>{current?.name ?? (me ? ROLE_LABEL[me.role] : 'Switch profile')}</span>
        <ChevronUp size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
    </div>
  );
}
