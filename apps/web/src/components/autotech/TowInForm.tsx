'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { api, ApiError, WorkItem } from '@/lib/api';
import { AtTopbar } from '@/components/autotech/kit';

/**
 * Tow a car in — the same tow-collection flow the tow driver has, now available to any staff member.
 * The employee has the car in front of them, so its basics and the customer's details are captured
 * here; saving auto-creates the job file. The pickup location is a typed address — the phone's GPS is
 * never sent. On success we stay inside the Auto Tech shell and confirm, rather than jumping to the
 * owner-side job page.
 */
export function TowInForm() {
  const [rego, setRego] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [pickupLocation, setPickup] = useState('');
  const [customerName, setName] = useState('');
  const [customerPhone, setPhone] = useState('');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const canSubmit =
    !!rego.trim() &&
    !!make.trim() &&
    !!model.trim() &&
    !!year.trim() &&
    !!pickupLocation.trim() &&
    !!customerName.trim() &&
    !!customerPhone.trim() &&
    !saving;

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await api.post<{ job: WorkItem }>('/yards/tow-collections', {
        rego: rego.trim(),
        make: make.trim(),
        model: model.trim(),
        year: Number(year),
        pickupLocation: pickupLocation.trim(),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        comments: comments.trim() || undefined,
      });
      setDone(rego.trim().toUpperCase());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not record the tow collection');
      setSaving(false);
    }
  }

  if (done) {
    return (
      <>
        <AtTopbar backHref="/inout/yards" />
        <div className="at-done">
          <CheckCircle2 size={56} strokeWidth={2} color="var(--at-green)" />
          <div className="at-done-t">Car towed in</div>
          <div className="at-done-s">
            {done} — a job file has been created and the team notified.
          </div>
          <Link href="/inout/yards" className="at-btn primary" style={{ marginTop: 18 }}>
            Done
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AtTopbar backHref="/inout/yards" />
      <div className="at-h2">Tow a car in</div>
      <div className="at-note">
        Saving creates a job file and notifies the team. No quote yet — that comes later at the
        workshop.
      </div>

      {err && <div className="at-errbanner">{err}</div>}

      <div className="at-lbl">Car</div>
      <div className="at-field">
        <div className="at-flabel">Rego</div>
        <input
          className="at-input rego"
          value={rego}
          onChange={(e) => setRego(e.target.value)}
          autoCapitalize="characters"
          placeholder="e.g. 7GH 220"
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Year</div>
        <input
          className="at-input"
          type="number"
          inputMode="numeric"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="e.g. 2018"
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Make</div>
        <input className="at-input" value={make} onChange={(e) => setMake(e.target.value)} />
      </div>
      <div className="at-field">
        <div className="at-flabel">Model</div>
        <input className="at-input" value={model} onChange={(e) => setModel(e.target.value)} />
      </div>

      <div className="at-lbl">Pickup</div>
      <div className="at-field">
        <div className="at-flabel">Picked up from</div>
        <input
          className="at-input"
          value={pickupLocation}
          onChange={(e) => setPickup(e.target.value)}
          placeholder="e.g. 42 Main St, Coburg North"
        />
      </div>

      <div className="at-lbl">Customer</div>
      <div className="at-field">
        <div className="at-flabel">Name</div>
        <input
          className="at-input"
          value={customerName}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Phone</div>
        <input
          className="at-input"
          type="tel"
          value={customerPhone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="at-field">
        <div className="at-flabel">Comments</div>
        <input
          className="at-input"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="e.g. front-end damage, not driveable"
        />
      </div>

      <button
        type="button"
        className="at-btn primary"
        disabled={!canSubmit}
        onClick={() => void submit()}
        style={{ marginTop: 8 }}
      >
        {saving ? 'Saving…' : 'Confirm collected'}
      </button>
    </>
  );
}
