'use client';
import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';

interface DemoAccount {
  label: string;
  email: string;
  password: string;
  role: 'OWNER' | 'STAFF';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    fetch('/api/auth/demo')
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => setAccounts([]));
  }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Invalid email or password');
      }
      // Full reload so the proxy picks up the new session cookie everywhere.
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: 'calc(100vh - var(--topbar-h) - 48px)',
      }}
    >
      <div className="card" style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Sign in</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0', fontSize: 14 }}>
            OneStack — Panel &amp; Paint
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@workshop.test"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          {error ? <div className="err">{error}</div> : null}
          <button className="btn primary" type="submit" disabled={busy || !email || !password}>
            <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {accounts.length ? (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-faint)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Test accounts
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {accounts.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  className="btn"
                  style={{ justifyContent: 'space-between', textAlign: 'left', width: '100%' }}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                  title="Click to fill the form"
                >
                  <span>
                    <strong>{a.label}</strong>
                    <span style={{ color: 'var(--text-dim)' }}> · {a.email}</span>
                  </span>
                  <code style={{ color: 'var(--text-dim)' }}>{a.password}</code>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '10px 0 0' }}>
              Demo credentials for testing — click one to fill, then Sign in.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
