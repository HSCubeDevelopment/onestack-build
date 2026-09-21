'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Delete, ShieldCheck } from 'lucide-react';

interface Person {
  userId: string;
  name: string;
  role: 'OWNER' | 'STAFF' | 'TOW';
  site: string | null;
}

const roleLabel: Record<Person['role'], string> = {
  OWNER: 'Owner',
  STAFF: 'Employee',
  TOW: 'Tow driver',
};

/**
 * PIN sign-in. Everyone — owner, tow driver, every employee — signs in by tapping their name and entering
 * their 4-digit PIN. No passwords on this screen. The PIN is verified server-side against a salted hash
 * with a per-person lockout; nothing sensitive is stored in the browser.
 */
export default function LoginPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Person | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Why the directory is unavailable — distinct from it being legitimately empty. */
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/pin-directory')
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as Person[] | { error?: string } | null;
        if (!r.ok || !Array.isArray(body)) {
          const msg =
            body && !Array.isArray(body) && body.error ? body.error : 'PIN sign-in is unavailable';
          setDirectoryError(msg);
          setPeople([]);
          return;
        }
        setPeople(body);
      })
      .catch(() => setDirectoryError('Cannot reach the OneStack API'))
      .finally(() => setLoaded(true));
  }, []);

  /** Group by role so the dropdown reads sensibly once the roster grows. */
  const grouped = useMemo(() => {
    const order: Person['role'][] = ['OWNER', 'STAFF', 'TOW'];
    return order
      .map((role) => ({ role, members: people.filter((p) => p.role === role) }))
      .filter((g) => g.members.length > 0);
  }, [people]);

  async function submit(person: Person, code: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: person.userId, pin: code }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Incorrect PIN');
      }
      window.location.assign('/'); // full reload so the proxy picks up the session cookie
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setPin('');
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busy || !selected) return;
    setError(null);
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(selected, next);
  }

  return (
    <div style={{ width: '100%', maxWidth: 400 }}>
      <div className="card" style={{ width: '100%' }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Sign in</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0', fontSize: 14 }}>
            OneStack — Panel &amp; Paint
          </p>
        </div>

        {!selected ? (
          /* Step 1 — pick who you are. A native <select> on purpose: on a phone it opens the system
             wheel picker, which is faster and more accessible than a custom list, and it cannot have
             the failure this screen used to have (a search box over an empty list, where typing did
             nothing and never said why). */
          <>
            {!loaded ? (
              <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>Loading…</p>
            ) : directoryError ? (
              <div className="err" role="alert">
                {directoryError}
              </div>
            ) : people.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>
                No one has a PIN yet. Ask the owner to generate them.
              </p>
            ) : (
              <>
                <label
                  htmlFor="who"
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: 'var(--text-dim)',
                  }}
                >
                  Who are you?
                </label>
                <select
                  id="who"
                  className="input"
                  defaultValue=""
                  style={{ width: '100%', fontSize: 16, padding: '12px 14px', borderRadius: 12 }}
                  onChange={(e) => {
                    const person = people.find((p) => p.userId === e.target.value) ?? null;
                    setSelected(person);
                    setPin('');
                    setError(null);
                  }}
                >
                  <option value="" disabled>
                    Select your name…
                  </option>
                  {grouped.map((g) => (
                    <optgroup key={g.role} label={roleLabel[g.role]}>
                      {g.members.map((p) => (
                        <option key={p.userId} value={p.userId}>
                          {p.name}
                          {p.site ? ` — ${p.site.split(',')[0]}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: '10px 0 0' }}>
                  Pick your name, then enter your 4-digit PIN.
                </p>
              </>
            )}
          </>
        ) : (
          /* Step 2 — enter the PIN. */
          <>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setPin('');
                setError(null);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: 'none',
                background: 'none',
                color: 'var(--brand, #007aff)',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                padding: 0,
                marginBottom: 10,
              }}
            >
              <ChevronLeft size={16} /> Not you?
            </button>

            <div style={{ textAlign: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Enter your 4-digit PIN</div>
            </div>

            {/* PIN dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, margin: '16px 0' }}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '2px solid var(--border)',
                    background: i < pin.length ? 'var(--brand, #007aff)' : 'transparent',
                    borderColor: i < pin.length ? 'var(--brand, #007aff)' : 'var(--border)',
                  }}
                />
              ))}
            </div>

            {error ? (
              <div className="err" style={{ textAlign: 'center' }}>
                {error}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  color: 'var(--text-faint)',
                  fontSize: 12,
                  minHeight: 18,
                }}
              >
                <ShieldCheck size={13} /> Locked after 5 wrong tries
              </div>
            )}

            {/* Keypad */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                marginTop: 12,
              }}
            >
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <KeypadButton key={d} onClick={() => press(d)} disabled={busy}>
                  {d}
                </KeypadButton>
              ))}
              <span />
              <KeypadButton onClick={() => press('0')} disabled={busy}>
                0
              </KeypadButton>
              <KeypadButton
                onClick={() => {
                  setError(null);
                  setPin((p) => p.slice(0, -1));
                }}
                disabled={busy || pin.length === 0}
                aria-label="Delete"
              >
                <Delete size={22} />
              </KeypadButton>
            </div>

            {busy && (
              <p
                style={{
                  textAlign: 'center',
                  color: 'var(--text-faint)',
                  fontSize: 13,
                  marginTop: 12,
                }}
              >
                Signing in…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KeypadButton({
  children,
  onClick,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        height: 60,
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--panel-2, #f7f7f9)',
        fontSize: 24,
        fontWeight: 600,
        color: 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
