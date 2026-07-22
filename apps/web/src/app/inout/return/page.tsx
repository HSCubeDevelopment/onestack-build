'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { BOND_OPTIONS, localInputToISO, nowLocalInputValue } from '@/lib/fleet';
import { ErrorBanner, PageHead } from '@/components/ui';

/** Record return — the shop's loan car comes back (In N Out flow), on the Fleet returns endpoint. */
export default function RecordReturnPage() {
  const router = useRouter();
  const [returnedRego, setReturnedRego] = useState('');
  const [driverName, setDriverName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [bondStatus, setBondStatus] = useState('');
  const [returnedAt, setReturnedAt] = useState(nowLocalInputValue());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!returnedRego.trim()) return;
    setErr(null);
    setSaving(true);
    try {
      await api.post('/fleet/returns', {
        returnedRego: returnedRego.trim(),
        driverName: driverName.trim() || undefined,
        mobileNumber: mobileNumber.trim() || undefined,
        bondStatus: bondStatus || undefined,
        returnedAt: localInputToISO(returnedAt),
        notes: notes.trim() || undefined,
      });
      router.push('/');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not record the return');
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Link href="/" className="link-btn">
          <ArrowLeft size={15} /> Home
        </Link>
      </div>
      <PageHead title="Record return" />
      <div className="card">
        <div className="stack" style={{ gap: 12 }}>
          <ErrorBanner message={err} />
          <label className="field">
            Returned fleet car rego
            <input
              className="input rego"
              value={returnedRego}
              onChange={(e) => setReturnedRego(e.target.value.toUpperCase())}
              placeholder="XYZ789"
              autoCapitalize="characters"
            />
          </label>
          <div className="grid cols-2">
            <label className="field">
              Driver name
              <input
                className="input"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
            </label>
            <label className="field">
              Mobile
              <input
                className="input"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                inputMode="tel"
              />
            </label>
          </div>
          <div className="grid cols-2">
            <label className="field">
              Bond
              <select
                className="select"
                value={bondStatus}
                onChange={(e) => setBondStatus(e.target.value)}
              >
                <option value="">Bond status…</option>
                {BOND_OPTIONS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Date &amp; time
              <input
                className="input"
                type="datetime-local"
                value={returnedAt}
                onChange={(e) => setReturnedAt(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Notes
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </label>
          <button
            className="btn primary"
            disabled={saving || !returnedRego.trim()}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Record return'}
          </button>
        </div>
      </div>
    </>
  );
}
