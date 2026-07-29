'use client';
import { useEffect, useState } from 'react';
import { KeyRound, MapPin, User } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

/** The employee's own profile + roster, with a self-service "change my PIN" flow. */

interface Profile {
  userId: string;
  role: 'OWNER' | 'STAFF' | 'TOW';
  name: string | null;
  email: string | null;
  sites: string[];
  pinSet: boolean;
}

const ROLE_LABEL: Record<string, string> = { OWNER: 'Owner', STAFF: 'Employee', TOW: 'Tow driver' };

export function MyProfile() {
  const [me, setMe] = useState<Profile | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .get<Profile>('/auth/me')
      .then(setMe)
      .catch((e) => setLoadErr(e instanceof ApiError ? e.message : 'Could not load your profile.'));
  }, []);

  async function changePin(): Promise<void> {
    setMsg(null);
    if (!/^[0-9]{4}$/.test(next)) return setMsg({ ok: false, text: 'New PIN must be 4 digits.' });
    if (next !== confirm) return setMsg({ ok: false, text: 'The new PINs don’t match.' });
    setSaving(true);
    try {
      await api.post('/auth/pin-change', { currentPin: current, newPin: next });
      setMsg({ ok: true, text: 'PIN changed. Use it next time you sign in.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not change PIN.' });
    } finally {
      setSaving(false);
    }
  }

  const pinInput = (value: string, set: (v: string) => void, label: string, autoFocus = false) => (
    <div className="at-field">
      <div className="at-flabel">{label}</div>
      <input
        className="at-input rego"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => set(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
        placeholder="••••"
        type="password"
      />
    </div>
  );

  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />
      <div className="at-h2">My profile</div>

      {loadErr && <div className="at-errbanner">{loadErr}</div>}

      {me && (
        <>
          <div className="at-mecard">
            <div className="row">
              <span className="ic">
                <User size={18} />
              </span>
              <div>
                <div className="k">Name</div>
                <div className="v">{me.name || me.email || 'You'}</div>
              </div>
            </div>
            <div className="row">
              <span className="ic">
                <KeyRound size={18} />
              </span>
              <div>
                <div className="k">Role</div>
                <div className="v">{ROLE_LABEL[me.role] ?? me.role}</div>
              </div>
            </div>
            <div className="row">
              <span className="ic">
                <MapPin size={18} />
              </span>
              <div>
                <div className="k">Rostered site{me.sites.length > 1 ? 's' : ''}</div>
                <div className="v">{me.sites.length ? me.sites.join(' · ') : '—'}</div>
              </div>
            </div>
          </div>

          <div className="at-phase-head" style={{ marginTop: 18 }}>
            <span className="t">Change my PIN</span>
          </div>
          <div className="at-note">Your 4-digit sign-in PIN. You’ll need your current one.</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pinInput(current, setCurrent, 'Current PIN')}
            {pinInput(next, setNext, 'New PIN')}
            {pinInput(confirm, setConfirm, 'Confirm new PIN')}
          </div>
          <button
            className="at-btn primary"
            style={{ marginTop: 12 }}
            disabled={saving || current.length !== 4 || next.length !== 4 || confirm.length !== 4}
            onClick={() => void changePin()}
          >
            {saving ? 'Saving…' : 'Update PIN'}
          </button>
          {msg && (
            <p
              className={`${msg.ok ? 'at-savedbanner' : 'at-errbanner'}`}
              style={{ marginTop: 10 }}
            >
              {msg.text}
            </p>
          )}
        </>
      )}
    </>
  );
}
