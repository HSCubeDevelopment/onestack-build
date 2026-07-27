'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Delete, Search, ShieldCheck } from 'lucide-react';

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
  const [query, setQuery] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/pin-directory')
      .then((r) => r.json())
      .then((d) => setPeople(Array.isArray(d) ? d : []))
      .catch(() => setPeople([]))
      .finally(() => setLoaded(true));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, query]);

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
          /* Step 1 — pick who you are. */
          <>
            <div
              className="field"
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}
            >
              <Search size={16} style={{ color: 'var(--text-faint)', flex: 'none' }} />
              <input
                className="input"
                style={{ border: 'none', padding: 0, background: 'transparent' }}
                placeholder="Search your name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search your name"
              />
            </div>

            {!loaded ? (
              <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>Loading…</p>
            ) : people.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>
                PIN sign-in isn’t set up yet. Ask the owner to generate the PINs.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: 6,
                  maxHeight: 340,
                  overflowY: 'auto',
                  margin: '0 -4px',
                  padding: '0 4px',
                }}
              >
                {shown.map((p) => (
                  <button
                    key={p.userId}
                    type="button"
                    onClick={() => {
                      setSelected(p);
                      setPin('');
                      setError(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--panel-2, #f7f7f9)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      font: 'inherit',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                      {roleLabel[p.role]}
                      {p.site ? ` · ${p.site.split(',')[0]}` : ''}
                    </span>
                  </button>
                ))}
                {shown.length === 0 && (
                  <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>
                    No one matches “{query}”.
                  </p>
                )}
              </div>
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
