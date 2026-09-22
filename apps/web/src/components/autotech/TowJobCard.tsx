'use client';
import { useState } from 'react';
import { Camera, Check, MapPin, Phone, Truck, Warehouse } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { compressToBase64 } from '@/lib/image';
import { buildStamp } from '@/lib/photo-stamp';
import { directionsHref, mapsAppName } from '@/lib/maps';
import type { TowJob } from '@/lib/tow';

/** The next thing the driver does, given where the job is up to. */
const STEPS: Record<
  string,
  {
    status: string;
    label: string;
    icon: 'truck' | 'pin' | 'check';
    tone: '' | 'collect' | 'finish';
  }
> = {
  pending: { status: 'en_route', label: 'On my way', icon: 'truck', tone: '' },
  dispatched: { status: 'en_route', label: 'On my way', icon: 'truck', tone: '' },
  en_route: { status: 'on_site', label: 'Car collected', icon: 'pin', tone: 'collect' },
  on_site: { status: 'completed', label: 'Dropped at yard', icon: 'check', tone: 'finish' },
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'To do',
  dispatched: 'To do',
  en_route: 'On the way',
  on_site: 'Collected',
  completed: 'Done',
};

/**
 * One tow, as the driver sees it: the car, then the two addresses, then the one action they can take.
 *
 * Starting a job requires a note. A driver who sets off without saying what they found — gate locked,
 * customer not there, car already on a truck — leaves the office guessing, and the office is the one
 * fielding the customer's call. Later steps take an optional note.
 */
export function TowJobCard({ job, onChanged }: { job: TowJob; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [note, setNote] = useState('');
  const [justAdvanced, setJustAdvanced] = useState(false);

  const step = STEPS[job.status];
  // The note is mandatory on the FIRST move only — that is the one the office is blind to.
  const needsNote = step?.status === 'en_route';

  // Before photos belong to the pickup, after photos to the drop-off.
  const atPickup = job.status !== 'on_site' && job.status !== 'completed';
  const taken = atPickup ? job.photos.pickup : job.photos.dropOff;

  const pickupHref = directionsHref(job.pickupAddress);
  // Yards are named by their street address, so the drop-off navigates too.
  const dropHref = directionsHref(job.dropOff?.name);
  const mapsApp = mapsAppName();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    setProgress('Getting your location…');
    try {
      // One fix for the whole batch: the photos are taken in the same place seconds apart, and asking
      // the browser per photo prompts repeatedly and drains the battery.
      const stamp = await buildStamp();
      setProgress(stamp.where ? `Stamping ${stamp.where}` : 'No location — stamping the time only');
      for (const f of Array.from(files)) {
        const { dataBase64, contentType } = await compressToBase64(f, 1600, stamp);
        await api.post(`/work-items/${job.jobId}/attachments`, {
          fileName: f.name || `${atPickup ? 'tow_pickup' : 'tow_dropoff'}.jpg`,
          contentType,
          dataBase64,
          caption: atPickup ? 'Tow pickup' : 'Tow drop-off',
        });
      }
      onChanged();
      setProgress(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not upload the photos');
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!step) return;
    const body = note.trim();
    if (needsNote && !body) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/work-items/${job.jobId}/dispatch`, {
        status: step.status,
        note: body || undefined,
      });
      // The dispatch row holds one note and each step overwrites it, so the note is also filed against
      // the job itself. That is the copy the office still has next week.
      if (body) {
        await api.post(`/work-items/${job.jobId}/notes`, {
          body: `${STATUS_LABEL[step.status] ?? step.status}: ${body}`,
        });
      }
      setJustAdvanced(true);
      setGateOpen(false);
      setNote('');
      onChanged();
      setTimeout(() => setJustAdvanced(false), 700);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not update the job');
    } finally {
      setBusy(false);
    }
  }

  const v = job.vehicle;
  const StepIcon = step?.icon === 'check' ? Check : step?.icon === 'pin' ? MapPin : Truck;

  return (
    <div className="at-job">
      <div className="at-job-head">
        <div style={{ minWidth: 0 }}>
          <div className="at-job-rego">{v?.rego ?? job.reference}</div>
          <div className="at-job-car">
            {v ? [v.make, v.model].filter(Boolean).join(' ') || 'Car' : 'Tow job'}
            {v?.year ? ` · ${v.year}` : ''}
          </div>
        </div>
        <span className={`at-status ${job.status}${justAdvanced ? ' bumped' : ''}`}>
          {STATUS_LABEL[job.status] ?? job.status}
        </span>
      </div>

      {/* Both addresses open turn-by-turn. A driver should never have to retype one. */}
      <Leg
        kind="pickup"
        icon={<MapPin size={18} />}
        label="Pick up from"
        value={job.pickupAddress ?? 'No address given'}
        href={pickupHref}
        mapsApp={mapsApp}
      />
      <Leg
        kind="drop"
        icon={<Warehouse size={18} />}
        label="Drop off at"
        value={job.dropOff?.name ?? 'No yard set'}
        href={dropHref}
        mapsApp={mapsApp}
      />

      {job.customer && (
        <div className="at-job-meta">
          <Phone size={16} style={{ flex: 'none', opacity: 0.55 }} />
          <span className="k">{job.customer.name}</span>
          <span style={{ flex: 1 }} />
          {job.customer.phone ? (
            <a className="at-link" href={`tel:${job.customer.phone}`}>
              {job.customer.phone}
            </a>
          ) : (
            <span className="k">No number</span>
          )}
        </div>
      )}

      {job.pickupNotes && (
        <div className="at-job-meta">
          <span className="k">Note from the office</span>
          <span style={{ flex: 1 }} />
          <span style={{ textAlign: 'right' }}>{job.pickupNotes}</span>
        </div>
      )}

      {job.status !== 'completed' && (
        <label className={`at-shot${taken ? ' done' : ''}`}>
          <Camera size={18} style={{ flex: 'none' }} />
          <span style={{ flex: 1 }}>
            {atPickup ? 'Before photos at pickup' : 'After photos at drop-off'}
            {taken ? ` · ${taken} taken` : ''}
          </span>
          <span className="at-link">{taken ? 'Add more' : 'Take'}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
      )}

      {progress && <p className="at-muted">{progress}</p>}
      {err && <div className="at-errbanner">{err}</div>}

      {step && !gateOpen && (
        <button
          className={`at-advance ${step.tone}${justAdvanced ? ' ok' : ''}`}
          disabled={busy}
          onClick={() => (needsNote ? setGateOpen(true) : void advance())}
        >
          <StepIcon size={19} /> {step.label}
        </button>
      )}

      {step && gateOpen && (
        <div className="at-notegate">
          <div className="why">
            Before you set off — what is happening with this one? The office cannot see the pickup.
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. heading there now, ETA 20 min — customer said keys are at reception"
            maxLength={500}
            autoFocus
          />
          <div className="at-gate-row">
            <button
              className="cancel"
              disabled={busy}
              onClick={() => {
                setGateOpen(false);
                setNote('');
              }}
            >
              Back
            </button>
            <button className="go" disabled={busy || !note.trim()} onClick={() => void advance()}>
              {busy ? 'Saving…' : step.label}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One leg of the trip. Renders as a link when there is somewhere to go, a plain block when not. */
function Leg({
  kind,
  icon,
  label,
  value,
  href,
  mapsApp,
}: {
  kind: 'pickup' | 'drop';
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string | null;
  mapsApp: string;
}) {
  const inner = (
    <>
      <span className="ic">{icon}</span>
      <span className="body">
        <span className="lab">{label}</span>
        <span className="val">{value}</span>
      </span>
      {href && <span className="go">{mapsApp.split(' ')[0]} ›</span>}
    </>
  );
  const cls = `at-leg${kind === 'drop' ? ' drop' : ''}`;
  return href ? (
    <a
      className={cls}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Directions to ${value} in ${mapsApp}`}
    >
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
