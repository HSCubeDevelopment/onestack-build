'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Camera, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { compressToBase64 } from '@/lib/image';
import { FleetVehicle } from '@/lib/fleet';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

/**
 * File a police / infringement ticket against a car (employee flow). Skeleton/first-cut: enter the rego,
 * the ticket details and a photo of the ticket, and it's saved against the car as a `ticket` photo with
 * the details in the note — so it's genuinely captured and searchable on the car record, not thrown away.
 * A dedicated tickets table (fines, due dates, who-pays) is a later refinement.
 */
export function TicketForm() {
  const [rego, setRego] = useState('');
  const [ticketNo, setTicketNo] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [authority, setAuthority] = useState('');
  const [fine, setFine] = useState('');
  const [offence, setOffence] = useState('');
  const [photo, setPhoto] = useState<{
    dataBase64: string;
    contentType: string;
    preview: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const canSubmit = !!rego.trim() && !!ticketNo.trim() && !!photo && !saving;

  async function pickPhoto(file: File) {
    setErr(null);
    try {
      const { dataBase64, contentType } = await compressToBase64(file);
      setPhoto({ dataBase64, contentType, preview: `data:${contentType};base64,${dataBase64}` });
    } catch {
      setErr('Could not read that photo — try again.');
    }
  }

  async function submit() {
    if (!photo) return;
    setSaving(true);
    setErr(null);
    try {
      const v = await api.getOr<FleetVehicle | null>(
        `/fleet/vehicles/lookup?rego=${encodeURIComponent(rego.trim())}`,
        null,
      );
      if (!v) throw new Error(`No car found for ${rego.trim().toUpperCase()}. Check the rego.`);
      const note = [
        `Ticket ${ticketNo.trim()}`,
        authority.trim() && `by ${authority.trim()}`,
        issuedOn && `on ${issuedOn}`,
        fine.trim() && `— $${fine.trim()} fine`,
        offence.trim() && `— ${offence.trim()}`,
      ]
        .filter(Boolean)
        .join(' ');
      await api.post('/fleet/photos', {
        vehicleId: v.id,
        photoType: 'ticket',
        dataBase64: photo.dataBase64,
        contentType: photo.contentType,
        notes: note,
      });
      setDone(rego.trim().toUpperCase());
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not file the ticket.',
      );
      setSaving(false);
    }
  }

  if (done) {
    return (
      <>
        <AtTopbar backHref="/inout" right={<SignOutButton />} />
        <div className="at-done">
          <CheckCircle2 size={56} strokeWidth={2} color="var(--at-green)" />
          <div className="at-done-t">Ticket filed</div>
          <div className="at-done-s">Saved against {done}. You’ll find it on the car’s record.</div>
          <Link href="/inout" className="at-btn primary" style={{ marginTop: 18 }}>
            Done
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AtTopbar backHref="/inout" right={<SignOutButton />} />
      <div className="at-h2">File a ticket</div>
      <div className="at-note">
        Photograph the infringement notice and log its details against the car.
      </div>

      {err && <div className="at-errbanner">{err}</div>}

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
        <div className="at-flabel">Ticket / notice number</div>
        <input
          className="at-input"
          value={ticketNo}
          onChange={(e) => setTicketNo(e.target.value)}
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Issued on</div>
        <input
          className="at-input"
          type="date"
          value={issuedOn}
          onChange={(e) => setIssuedOn(e.target.value)}
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Issued by</div>
        <input
          className="at-input"
          value={authority}
          onChange={(e) => setAuthority(e.target.value)}
          placeholder="e.g. Victoria Police"
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Fine amount ($)</div>
        <input
          className="at-input"
          type="number"
          inputMode="decimal"
          value={fine}
          onChange={(e) => setFine(e.target.value)}
        />
      </div>
      <div className="at-field">
        <div className="at-flabel">Offence / reason</div>
        <input
          className="at-input"
          value={offence}
          onChange={(e) => setOffence(e.target.value)}
          placeholder="e.g. parking, speeding, toll"
        />
      </div>

      <div className="at-field">
        <div className="at-flabel">Photo of the ticket</div>
        {photo ? (
          <div className="at-photorow">
            <div className="at-photothumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt="Ticket" />
              <button
                type="button"
                className="rm"
                aria-label="Remove"
                onClick={() => setPhoto(null)}
              >
                <X size={14} strokeWidth={3} />
              </button>
            </div>
          </div>
        ) : (
          <label className="at-photoadd" style={{ cursor: 'pointer' }}>
            <Camera size={26} strokeWidth={2} />
            <span>Add photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickPhoto(f);
              }}
            />
          </label>
        )}
      </div>

      <button
        type="button"
        className="at-btn primary"
        disabled={!canSubmit}
        onClick={() => void submit()}
        style={{ marginTop: 8 }}
      >
        <ShieldAlert size={18} strokeWidth={2.4} />
        {saving ? 'Filing…' : 'File ticket'}
      </button>
    </>
  );
}
