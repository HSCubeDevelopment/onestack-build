'use client';
import { useEffect, useMemo, useState } from 'react';
import { LogIn } from 'lucide-react';

interface DemoAccount {
  label: string;
  email: string;
  password: string;
  role: 'OWNER' | 'STAFF' | 'TOW';
}
interface Employee {
  name: string;
  email: string;
  site: string;
  password: string;
}
type RoleChoice = 'OWNER' | 'EMPLOYEE' | 'TOW';

export default function LoginPage() {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [role, setRole] = useState<RoleChoice>('EMPLOYEE');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual email/password fallback (real accounts).
  const [manual, setManual] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    fetch('/api/auth/demo')
      .then((r) => r.json())
      .then((d) => {
        setAccounts(d.accounts ?? []);
        setEmployees(d.employees ?? []);
        // If the demo directory isn't available, fall straight to manual sign-in.
        if (!(d.accounts ?? []).length && !(d.employees ?? []).length) setManual(true);
      })
      .catch(() => setManual(true));
  }, []);

  const owner = accounts.find((a) => a.role === 'OWNER');
  const tow = accounts.find((a) => a.role === 'TOW');

  // Employees grouped by site for the dropdown's optgroups.
  const bySite = useMemo(() => {
    const groups = new Map<string, Employee[]>();
    for (const e of employees) {
      const list = groups.get(e.site) ?? [];
      list.push(e);
      groups.set(e.site, list);
    }
    return [...groups.entries()];
  }, [employees]);

  async function signInWith(em: string, pw: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: em.trim(), password: pw }),
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
  }

  const roleTabs: { key: RoleChoice; label: string; enabled: boolean }[] = [
    { key: 'OWNER', label: 'Owner', enabled: !!owner },
    { key: 'EMPLOYEE', label: 'Employee', enabled: employees.length > 0 },
    { key: 'TOW', label: 'Tow', enabled: !!tow },
  ];

  const selectedEmployee = employees.find((e) => e.email === employeeEmail);

  return (
    <div style={{ width: '100%', maxWidth: 400 }}>
      <div className="card" style={{ width: '100%' }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Sign in</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0', fontSize: 14 }}>
            OneStack — Panel &amp; Paint
          </p>
        </div>

        {!manual && (accounts.length > 0 || employees.length > 0) ? (
          <>
            <div className="field" style={{ marginBottom: 14 }}>
              <span>I&apos;m signing in as</span>
              <div className="seg" role="tablist" aria-label="Role" style={{ marginTop: 6 }}>
                {roleTabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={role === t.key}
                    disabled={!t.enabled}
                    className={role === t.key ? 'on' : ''}
                    onClick={() => {
                      setRole(t.key);
                      setError(null);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {role === 'EMPLOYEE' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <label className="field">
                  <span>Employee</span>
                  <select
                    className="input"
                    value={employeeEmail}
                    onChange={(e) => setEmployeeEmail(e.target.value)}
                    aria-label="Select employee"
                  >
                    <option value="">Select employee…</option>
                    {bySite.map(([site, list]) => (
                      <optgroup key={site} label={site}>
                        {list.map((e) => (
                          <option key={e.email} value={e.email}>
                            {e.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {error ? <div className="err">{error}</div> : null}
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy || !selectedEmployee}
                  onClick={() =>
                    selectedEmployee &&
                    void signInWith(selectedEmployee.email, selectedEmployee.password)
                  }
                >
                  <LogIn size={16} />{' '}
                  {busy
                    ? 'Signing in…'
                    : selectedEmployee
                      ? `Sign in as ${selectedEmployee.name}`
                      : 'Select an employee'}
                </button>
                <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0' }}>
                  {employees.length} employees across {new Set(employees.map((e) => e.site)).size}{' '}
                  sites.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {error ? <div className="err">{error}</div> : null}
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy || (role === 'OWNER' ? !owner : !tow)}
                  onClick={() => {
                    const a = role === 'OWNER' ? owner : tow;
                    if (a) void signInWith(a.email, a.password);
                  }}
                >
                  <LogIn size={16} />{' '}
                  {busy ? 'Signing in…' : role === 'OWNER' ? 'Sign in as Owner' : 'Sign in as Tow'}
                </button>
                <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0' }}>
                  {role === 'OWNER'
                    ? 'Full workshop admin — dashboard, jobs, money, settings.'
                    : 'Tow driver — tow-in, your jobs and your shift clock.'}
                </p>
              </div>
            )}

            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <button
                type="button"
                className="btn"
                style={{ width: '100%' }}
                onClick={() => setManual(true)}
              >
                Sign in with email &amp; password
              </button>
            </div>
          </>
        ) : (
          <ManualForm
            email={email}
            password={password}
            setEmail={setEmail}
            setPassword={setPassword}
            busy={busy}
            error={error}
            onSubmit={() => void signInWith(email, password)}
            canGoBack={accounts.length > 0 || employees.length > 0}
            onBack={() => {
              setManual(false);
              setError(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function ManualForm({
  email,
  password,
  setEmail,
  setPassword,
  busy,
  error,
  onSubmit,
  canGoBack,
  onBack,
}: {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  canGoBack: boolean;
  onBack: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: 'grid', gap: 12 }}
    >
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
      {canGoBack ? (
        <button type="button" className="btn" style={{ width: '100%' }} onClick={onBack}>
          Back to quick sign-in
        </button>
      ) : null}
    </form>
  );
}
