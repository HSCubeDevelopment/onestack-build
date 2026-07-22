'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { localInputToISO, nowLocalInputValue, PURPOSE_OPTIONS, RegoConflict } from '@/lib/fleet';
import { ErrorBanner, PageHead } from '@/components/ui';

type Mode = 'full' | 'rent' | 'intake' | 'handback';
const MODE_TITLE: Record<Mode, string> = {
  full: 'New movement',
  rent: 'Rent a car out',
  intake: 'Customer car intake',
  handback: 'Give car back',
};
const MODE_PURPOSE: Record<Mode, string> = {
  full: 'COURTESY',
  rent: 'RENT',
  intake: 'REPAIRS',
  handback: 'PICKUP',
};

export default function NewMovementPage() {
  return (
    <Suspense fallback={null}>
      <NewMovementForm />
    </Suspense>
  );
}

function NewMovementForm() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = (
    ['full', 'rent', 'intake', 'handback'].includes(params.get('mode') ?? '')
      ? params.get('mode')
      : 'full'
  ) as Mode;

  const showCarsIn = mode !== 'rent'; // rent has no customer car in
  const showCarsOut = mode === 'full' || mode === 'rent'; // intake/handback are the customer's car only
  const carsOutLabel = mode === 'rent' ? 'Car rego (renting out)' : 'Our car rego (out)';

  const [staffName, setStaffName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [carsInRego, setCarsInRego] = useState('');
  const [carsOutRego, setCarsOutRego] = useState('');
  const [purpose, setPurpose] = useState(MODE_PURPOSE[mode]);
  const [movedAt, setMovedAt] = useState(nowLocalInputValue());
  const [notes, setNotes] = useState('');
  const [conflict, setConflict] = useState<RegoConflict | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setPurpose(MODE_PURPOSE[mode]), [mode]);

  // Live availability check on the outgoing rego (≥4 chars), mirroring getRegoConflicts — warn, never block.
  useEffect(() => {
    if (!showCarsOut) return;
    const rego = carsOutRego.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rego.length < 4) {
      setConflict(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      api
        .getOr<RegoConflict>(`/fleet/vehicles/conflicts?rego=${encodeURIComponent(rego)}`, {
          vehicle: null,
          activeMovement: null,
          bookings: [],
        })
        .then((c) => alive && setConflict(c))
        .catch(() => alive && setConflict(null));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [carsOutRego, showCarsOut]);

  const cleanOut = carsOutRego.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hasBlock =
    !!conflict &&
    (!!conflict.activeMovement ||
      (conflict.vehicle && ['out', 'booked', 'repair'].includes(conflict.vehicle.status)) ||
      conflict.bookings.length > 0);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      await api.post('/fleet/movements', {
        staffName: staffName.trim() || undefined,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        ownerName: ownerName.trim() || undefined,
        carsInRego: showCarsIn && carsInRego.trim() ? carsInRego.trim() : undefined,
        carsOutRego: showCarsOut && carsOutRego.trim() ? carsOutRego.trim() : undefined,
        purpose,
        movedAt: localInputToISO(movedAt),
        notes: notes.trim() || undefined,
      });
      router.push('/');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the movement');
      setSaving(false);
    }
  }

  const canSave =
    !saving && ((showCarsIn && !!carsInRego.trim()) || (showCarsOut && !!carsOutRego.trim()));

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Link href="/" className="link-btn">
          <ArrowLeft size={15} /> Home
        </Link>
      </div>
      <PageHead title={MODE_TITLE[mode]} />

      <div className="card">
        <div className="stack" style={{ gap: 12 }}>
          <ErrorBanner message={err} />

          <label className="field">
            Staff name
            <input
              className="input"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <div className="grid cols-2">
            <label className="field">
              Driver name
              <input
                className="input"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="e.g. Sarah Nguyen"
              />
            </label>
            <label className="field">
              Mobile number
              <input
                className="input"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                placeholder="04xx xxx xxx"
                inputMode="tel"
              />
            </label>
          </div>
          <label className="field">
            Owner name
            <input
              className="input"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="If not the driver"
            />
          </label>

          {showCarsIn && (
            <label className="field">
              {mode === 'handback' ? 'Customer car rego (going back)' : 'Customer car rego (in)'}
              <input
                className="input rego"
                value={carsInRego}
                onChange={(e) => setCarsInRego(e.target.value.toUpperCase())}
                placeholder="ABC123"
                autoCapitalize="characters"
              />
            </label>
          )}

          {showCarsOut && (
            <label className="field">
              {carsOutLabel}
              <input
                className="input rego"
                value={carsOutRego}
                onChange={(e) => setCarsOutRego(e.target.value.toUpperCase())}
                placeholder="XYZ789"
                autoCapitalize="characters"
              />
              <AvailabilityLine rego={cleanOut} conflict={conflict} hasBlock={!!hasBlock} />
            </label>
          )}

          <label className="field">
            Purpose
            <div className="seg" role="tablist" aria-label="Purpose">
              {PURPOSE_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={purpose === p.value ? 'on' : ''}
                  onClick={() => setPurpose(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </label>

          <label className="field">
            Date &amp; time
            <input
              className="input"
              type="datetime-local"
              value={movedAt}
              onChange={(e) => setMovedAt(e.target.value)}
            />
          </label>
          <label className="field">
            Notes
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fuel level, existing damage…"
              rows={2}
            />
          </label>

          {/* Before photos — visual placeholders (photo upload is a follow-up). */}
          <div className="field">
            <span className="lbl2">
              {mode === 'handback' ? 'Photos + tow card' : 'Before photos'}
            </span>
            <div className="row" style={{ gap: 10 }}>
              <div className="photobox">
                <Camera size={22} />
              </div>
              <div className="photobox">
                <Plus size={22} />
              </div>
            </div>
          </div>

          <button className="btn primary" disabled={!canSave} onClick={() => void save()}>
            {saving ? 'Saving…' : `Save ${mode === 'handback' ? 'handback' : 'movement'}`}
          </button>
        </div>
      </div>
    </>
  );
}

/** The live availability line under the "cars out" rego — warn (never block) or a green all-clear. */
function AvailabilityLine({
  rego,
  conflict,
  hasBlock,
}: {
  rego: string;
  conflict: RegoConflict | null;
  hasBlock: boolean;
}) {
  if (rego.length < 4 || !conflict) return null;
  if (hasBlock) {
    const line = conflict.activeMovement
      ? `Already out to ${conflict.activeMovement.driverName || 'a driver'}.`
      : conflict.vehicle?.status === 'repair'
        ? 'Vehicle is marked "In repair".'
        : conflict.bookings.length > 0
          ? 'Booked soon by someone else.'
          : `Marked ${conflict.vehicle?.status}.`;
    return (
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          padding: 12,
          borderRadius: 12,
          border: '1px solid var(--amber, #b37d28)',
          background: 'var(--amber-soft)',
        }}
      >
        <AlertTriangle size={16} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 13 }}>
          <b>{rego} may not be free</b>
          <div className="muted">{line} — you can still give it out (Save anyway).</div>
        </div>
      </div>
    );
  }
  if (conflict.vehicle) {
    return (
      <div
        className="okline"
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          color: 'var(--green)',
          fontWeight: 650,
          fontSize: 13.5,
        }}
      >
        <CheckCircle2 size={15} /> {rego} is available —{' '}
        {[conflict.vehicle.make, conflict.vehicle.model].filter(Boolean).join(' ') || 'fleet car'}
      </div>
    );
  }
  return (
    <div className="faint" style={{ marginTop: 8, fontSize: 13 }}>
      {rego} — not in the fleet list
    </div>
  );
}
