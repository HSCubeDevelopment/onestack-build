'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ErrorBanner, Modal, useAsync } from '@/components/ui';
import { Yard } from '@/lib/yards';

interface Driver {
  userId: string;
  role: string;
}

/**
 * Book a tow: send a driver to collect a car and drop it at a yard.
 *
 * Open to STAFF as well as OWNER — the front desk books tows. That is safe because the endpoint behind
 * this creates a NEW job and can only assign it to someone holding the TOW role; it cannot reach an
 * existing job, so a worker still cannot route the shop's work to themselves.
 *
 * Distinct from "Tow in a car", which records a pickup a driver has ALREADY done.
 */
export function BookTowModal({
  yards,
  onClose,
  onBooked,
}: {
  yards: Yard[];
  onClose: () => void;
  onBooked: () => void;
}) {
  const { data: drivers } = useAsync(() => api.get<Driver[]>('/tow/drivers'), []);
  const [f, setF] = useState({
    driverUserId: '',
    destinationYardId: yards[0]?.id ?? '',
    pickupAddress: '',
    rego: '',
    make: '',
    model: '',
    year: String(new Date().getFullYear()),
    customerName: '',
    customerPhone: '',
    pickupNotes: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/tow/jobs', {
        ...f,
        rego: f.rego.trim().toUpperCase(),
        year: Number(f.year),
        pickupNotes: f.pickupNotes.trim() || undefined,
      });
      onBooked();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not book the tow');
    } finally {
      setBusy(false);
    }
  }

  const ready =
    f.driverUserId &&
    f.destinationYardId &&
    f.pickupAddress.trim() &&
    f.rego.trim() &&
    f.make.trim() &&
    f.model.trim() &&
    f.customerName.trim() &&
    f.customerPhone.trim();

  return (
    <Modal title="Book a tow" onClose={onClose}>
      <ErrorBanner message={err} />

      <label className="lbl">Driver</label>
      <select className="input" value={f.driverUserId} onChange={set('driverUserId')}>
        <option value="">Choose a driver…</option>
        {(drivers ?? []).map((d) => (
          <option key={d.userId} value={d.userId}>
            {d.userId.slice(0, 8)}
          </option>
        ))}
      </select>
      {drivers?.length === 0 && (
        <p className="job-cust">No one has the tow-driver role yet, so there is nobody to send.</p>
      )}

      <label className="lbl">Pick up from</label>
      <input
        className="input"
        value={f.pickupAddress}
        onChange={set('pickupAddress')}
        placeholder="12 Example St, Epping VIC"
      />

      <label className="lbl">Drop off at</label>
      <select className="input" value={f.destinationYardId} onChange={set('destinationYardId')}>
        {yards.map((y) => (
          <option key={y.id} value={y.id}>
            {y.name}
          </option>
        ))}
      </select>

      <label className="lbl">Rego</label>
      <input
        className="input"
        value={f.rego}
        onChange={set('rego')}
        maxLength={7}
        placeholder="ABC123"
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label className="lbl">Make</label>
          <input className="input" value={f.make} onChange={set('make')} placeholder="Toyota" />
        </div>
        <div style={{ flex: 1 }}>
          <label className="lbl">Model</label>
          <input className="input" value={f.model} onChange={set('model')} placeholder="Hilux" />
        </div>
        <div style={{ width: 90 }}>
          <label className="lbl">Year</label>
          <input className="input" value={f.year} onChange={set('year')} inputMode="numeric" />
        </div>
      </div>

      <label className="lbl">Customer</label>
      <input
        className="input"
        value={f.customerName}
        onChange={set('customerName')}
        placeholder="Name"
      />
      <input
        className="input"
        value={f.customerPhone}
        onChange={set('customerPhone')}
        inputMode="tel"
        placeholder="Phone — the driver rings this"
      />

      <label className="lbl">Notes for the driver</label>
      <input
        className="input"
        value={f.pickupNotes}
        onChange={set('pickupNotes')}
        placeholder="e.g. keys with reception"
      />

      <button
        className="btn primary"
        disabled={!ready || busy}
        onClick={() => void submit()}
        style={{ marginTop: 14, width: '100%' }}
      >
        {busy ? 'Booking…' : 'Book the tow'}
      </button>
    </Modal>
  );
}
