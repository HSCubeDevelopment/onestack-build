'use client';
import { useCallback, useEffect, useState } from 'react';
import { Camera, Check, MapPin, Phone, Truck, Warehouse } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { compressToBase64 } from '@/lib/image';
import { buildStamp } from '@/lib/photo-stamp';

export interface TowJob {
  jobId: string;
  reference: string;
  status: string;
  pickupAddress: string | null;
  pickupNotes: string | null;
  dropOff: { yardId: string; name: string } | null;
  vehicle: { rego: string; make: string; model: string; year: number | null } | null;
  customer: { name: string; phone: string | null } | null;
  photos: { pickup: number; dropOff: number };
  assignedTo: string | null;
  updatedAt: string;
}

/** How often the list refetches. There is no push of any kind, so this is the only way a newly booked
 *  tow reaches a driver who already has the screen open. */
const POLL_MS = 60_000;

/**
 * The driver's outstanding pickups.
 *
 * Each job walks the existing dispatch statuses, and the photo prompts are tied to that walk: before
 * photos are asked for at the pickup end, after photos at the drop-off end. Both are stamped with the
 * time and place they were actually taken — see lib/photo-stamp.ts, which explains why that is a
 * deliberate exception to this app's usual stance on storing a position.
 */
export function TowPickups() {
  const [jobs, setJobs] = useState<TowJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await api.get<TowJob[]>('/tow/mine'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your pickups');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="err">{error}</div>;
  if (!jobs) return <p className="at-muted">Loading your pickups…</p>;
  if (jobs.length === 0) return <p className="at-muted">No pickups right now.</p>;

  return (
    <>
      {jobs.map((j) => (
        <TowCard key={j.jobId} job={j} onChanged={load} />
      ))}
    </>
  );
}

function TowCard({ job, onChanged }: { job: TowJob; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Before photos belong to the pickup; after photos to the drop-off. Which one the camera is
  // capturing depends on where the driver is up to.
  const atPickup = job.status !== 'on_site' && job.status !== 'completed';
  const category = atPickup ? 'tow_pickup' : 'tow_dropoff';
  const taken = atPickup ? job.photos.pickup : job.photos.dropOff;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    setNote('Getting your location…');
    try {
      // One fix for the whole batch: they were taken in the same place, seconds apart, and asking the
      // browser per photo would prompt repeatedly and drain the battery.
      const stamp = await buildStamp();
      setNote(stamp.where ? `Stamping ${stamp.where}` : 'No location — stamping the time only');
      for (const f of Array.from(files)) {
        const { dataBase64, contentType } = await compressToBase64(f, 1600, stamp);
        await api.post(`/work-items/${job.jobId}/attachments`, {
          fileName: f.name || `${category}.jpg`,
          contentType,
          dataBase64,
          caption: atPickup ? 'Tow pickup' : 'Tow drop-off',
        });
      }
      onChanged();
      setNote(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not upload the photos');
      setNote(null);
    } finally {
      setBusy(false);
    }
  }

  async function advance(status: string) {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/work-items/${job.jobId}/dispatch`, { status });
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not update the job');
    } finally {
      setBusy(false);
    }
  }

  const v = job.vehicle;
  return (
    <div className="at-tk" style={{ marginBottom: 14 }}>
      <div className="at-h2">
        {v ? `${v.rego} · ${v.make} ${v.model}` : job.reference}
        {v?.year ? ` (${v.year})` : ''}
      </div>

      <Row icon={<MapPin size={15} />} label="Pick up from" value={job.pickupAddress ?? '—'} />
      <Row
        icon={<Warehouse size={15} />}
        label="Drop off at"
        value={job.dropOff?.name ?? 'No yard set'}
      />
      {job.customer && (
        <Row
          icon={<Phone size={15} />}
          label={job.customer.name}
          value={
            job.customer.phone ? (
              // A driver on the road needs to ring, not read out digits.
              <a href={`tel:${job.customer.phone}`} className="at-link">
                {job.customer.phone}
              </a>
            ) : (
              'No number'
            )
          }
        />
      )}
      {job.pickupNotes && <p className="at-muted">{job.pickupNotes}</p>}

      <div
        className="at-note"
        style={{ margin: '10px 0', fontWeight: 600, display: 'flex', gap: 6 }}
      >
        <Camera size={15} />
        {atPickup
          ? `Take BEFORE photos of the car at pickup${taken ? ` · ${taken} taken` : ''}`
          : `Take AFTER photos at drop-off${taken ? ` · ${taken} taken` : ''}`}
      </div>
      <label className="at-btn ghost" style={{ display: 'inline-flex', width: 'auto' }}>
        <Camera size={16} /> {taken ? 'Add more photos' : 'Take photos'}
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

      {note && <p className="at-muted">{note}</p>}
      {err && <div className="err">{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {job.status === 'dispatched' && (
          <button className="at-btn" disabled={busy} onClick={() => void advance('en_route')}>
            <Truck size={16} /> On my way
          </button>
        )}
        {job.status === 'en_route' && (
          <button className="at-btn" disabled={busy} onClick={() => void advance('on_site')}>
            <MapPin size={16} /> Car collected
          </button>
        )}
        {job.status === 'on_site' && (
          <button className="at-btn" disabled={busy} onClick={() => void advance('completed')}>
            <Check size={16} /> Dropped at yard
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 6 }}>
      <span style={{ flex: 'none', opacity: 0.6 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div className="at-muted" style={{ fontSize: 12 }}>
          {label}
        </div>
        <div style={{ fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}
