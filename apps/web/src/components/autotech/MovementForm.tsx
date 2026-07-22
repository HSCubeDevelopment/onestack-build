'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { localInputToISO, nowLocalInputValue, PURPOSE_OPTIONS, RegoConflict } from '@/lib/fleet';
import { AtTopbar, Toast } from '@/components/autotech/kit';

export type MoveKind = 'in' | 'out' | 'back' | 'return';

/**
 * One form, four flows — faithful to the Auto Tech demo's Cars-menu tiles:
 *   in     Customer car IN for repair   → records the customer's car arriving
 *   out    Loan car OUT                 → gives a fleet car out, with the live availability check
 *   back   Give repaired car back       → records the customer's car leaving
 *   return Loan car back                → our fleet car comes home
 * Fields show/hide by kind, mirroring the demo. Wired to the existing Fleet API (no API change).
 */
interface KindCfg {
  title: string;
  regoField: 'in' | 'out';
  regoLabel: string;
  purpose: boolean;
  availability: boolean;
  save: 'movement' | 'return';
  defaultPurpose: string;
}
const KIND: Record<MoveKind, KindCfg> = {
  in: {
    title: 'Customer car IN',
    regoField: 'in',
    regoLabel: 'Customer car rego (IN for repair)',
    purpose: true,
    availability: false,
    save: 'movement',
    defaultPurpose: 'REPAIRS',
  },
  out: {
    title: 'Loan car OUT',
    regoField: 'out',
    regoLabel: 'Loan car rego (OUT)',
    purpose: true,
    availability: true,
    save: 'movement',
    defaultPurpose: 'RENT',
  },
  back: {
    title: 'Give car back',
    regoField: 'in',
    regoLabel: 'Customer car rego (picking up)',
    purpose: false,
    availability: false,
    save: 'movement',
    defaultPurpose: 'PICKUP',
  },
  return: {
    title: 'Loan car back',
    regoField: 'out',
    regoLabel: 'Loan car rego (returning)',
    purpose: false,
    availability: false,
    save: 'return',
    defaultPurpose: 'COURTESY',
  },
};

export function MovementForm({ kind }: { kind: MoveKind }) {
  const cfg = KIND[kind];
  const router = useRouter();

  const [staffName, setStaffName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [rego, setRego] = useState('');
  const [purpose, setPurpose] = useState(cfg.defaultPurpose);
  const [notes, setNotes] = useState('');
  const [conflict, setConflict] = useState<RegoConflict | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const clean = rego.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Live availability on the loan-out rego (≥4 chars) — warn, never block. Mirrors getRegoConflicts.
  useEffect(() => {
    if (!cfg.availability) return;
    if (clean.length < 4) {
      setConflict(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      api
        .getOr<RegoConflict>(`/fleet/vehicles/conflicts?rego=${encodeURIComponent(clean)}`, {
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
  }, [clean, cfg.availability]);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      if (cfg.save === 'return') {
        await api.post('/fleet/returns', {
          returnedRego: clean,
          driverName: customerName.trim() || undefined,
          mobileNumber: mobile.trim() || undefined,
          staffName: staffName.trim() || undefined,
          notes: notes.trim() || undefined,
          returnedAt: new Date().toISOString(),
        });
      } else {
        await api.post('/fleet/movements', {
          staffName: staffName.trim() || undefined,
          driverName: customerName.trim() || undefined,
          driverPhone: mobile.trim() || undefined,
          carsInRego: cfg.regoField === 'in' ? clean || undefined : undefined,
          carsOutRego: cfg.regoField === 'out' ? clean || undefined : undefined,
          purpose: cfg.purpose ? purpose : cfg.defaultPurpose,
          movedAt: localInputToISO(nowLocalInputValue()),
          notes: notes.trim() || undefined,
        });
      }
      setToast('Saved ✓');
      setTimeout(() => router.push('/inout'), 700);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
      setSaving(false);
    }
  }

  const canSave = !saving && clean.length >= 3;

  return (
    <>
      <AtTopbar backHref="/inout" />
      <div className="at-h2">{cfg.title}</div>

      {err && <div className="at-errbanner">{err}</div>}

      <div className="at-field">
        <div className="at-flabel">Staff name</div>
        <input
          className="at-input"
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          placeholder="Your name"
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Customer name</div>
        <input
          className="at-input"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="e.g. Sarah Nguyen"
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Mobile number</div>
        <input
          className="at-input"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="04xx xxx xxx"
          inputMode="tel"
        />
      </div>

      <div className="at-field">
        <div className="at-flabel">{cfg.regoLabel}</div>
        <input
          className="at-input rego"
          value={rego}
          onChange={(e) => setRego(e.target.value.toUpperCase())}
          placeholder={cfg.regoField === 'out' ? 'XYZ789' : 'ABC123'}
          autoCapitalize="characters"
        />
        {cfg.availability && <AvailabilityLine rego={clean} conflict={conflict} />}
      </div>

      {cfg.purpose && (
        <div className="at-field">
          <div className="at-flabel">Purpose</div>
          <div className="at-seg">
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
        </div>
      )}

      <div className="at-field">
        <div className="at-flabel">Notes</div>
        <textarea
          className="at-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Fuel, damage, anything to note…"
        />
      </div>

      {/* Photos — visual placeholders (upload is a follow-up). */}
      <div className="at-field">
        <div className="at-flabel">Photos</div>
        <div className="at-photorow">
          <div className="at-photobox">
            <Camera size={28} />
            <span>Add</span>
          </div>
          <div className="at-photobox" style={{ fontSize: 26 }}>
            +
          </div>
        </div>
      </div>

      <button
        className="at-btn primary"
        disabled={!canSave}
        onClick={() => void save()}
        style={{ marginBottom: 12 }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>

      <Toast message={toast} />
    </>
  );
}

/** The live availability line under the loan-out rego — warn (never block) or a green all-clear. */
function AvailabilityLine({ rego, conflict }: { rego: string; conflict: RegoConflict | null }) {
  if (rego.length < 4 || !conflict) return null;

  const blocked =
    !!conflict.activeMovement ||
    (conflict.vehicle && ['out', 'booked', 'repair'].includes(conflict.vehicle.status)) ||
    conflict.bookings.length > 0;

  if (blocked) {
    const line = conflict.activeMovement
      ? `Already out to ${conflict.activeMovement.driverName || 'a driver'}.`
      : conflict.vehicle?.status === 'repair'
        ? 'Vehicle is marked "In repair".'
        : conflict.bookings.length > 0
          ? 'Booked soon by someone else.'
          : `Marked ${conflict.vehicle?.status}.`;
    return (
      <div className="at-warn">
        <span className="wsym">&#9888;</span>
        <div>
          <div className="wt">{rego} may not be free</div>
          <div>{line}</div>
          <div style={{ color: 'var(--at-gray)', marginTop: 2 }}>
            You can still give it out — just Save.
          </div>
        </div>
      </div>
    );
  }
  if (conflict.vehicle) {
    const name =
      [conflict.vehicle.make, conflict.vehicle.model].filter(Boolean).join(' ') || 'fleet car';
    return (
      <div className="at-okline">
        &#10003; {rego} is available — {name}
      </div>
    );
  }
  return <div className="at-faintline">{rego} — not in fleet list</div>;
}
