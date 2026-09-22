'use client';
import { useCallback, useEffect, useState } from 'react';
import { Camera, MapPin, Phone, Truck, Warehouse } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';
import { PhotoLightbox, useLightbox, type LightboxPhoto } from '@/components/PhotoLightbox';
import { directionsHref } from '@/lib/maps';
import type { TowJob } from '@/lib/tow';

interface TowActivityItem extends TowJob {
  driverName: string | null;
}
interface TowActivity {
  active: TowActivityItem[];
  past: TowActivityItem[];
}
interface TowPhoto {
  id: string;
  caption: string | null;
  fileName: string;
  leg: 'pickup' | 'dropoff' | 'other';
  uploadedAt: string;
}

/** Statuses that mean the driver is actually out, as opposed to a job merely booked. */
const ON_THE_ROAD = new Set(['en_route', 'on_site']);

const STATUS_LABEL: Record<string, string> = {
  pending: 'Not started',
  dispatched: 'Not started',
  en_route: 'Driving to pickup',
  on_site: 'Car collected',
  completed: 'Done',
};

/** How long ago, in words. The office's real question is "is this current or from this morning?". */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const POLL_MS = 45_000;

/**
 * What the tow driver is doing — for the office, not the driver.
 *
 * The front desk fields "where is my car?" and had no way to answer it: tow jobs belong to the driver,
 * and a staff member is not assigned to them, so nothing about a tow was visible from the shop floor.
 * This screen reads the shop-wide tow board (see the API's /tow/activity, which is deliberately wider
 * than the usual assignee scope and reaches TOW work only).
 *
 * The headline answers the actual question — out on a job, or not — before any detail.
 */
export function TowDriverStatus() {
  const [data, setData] = useState<TowActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<TowActivity>('/tow/activity'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load tow jobs');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const active = data?.active ?? [];
  const past = data?.past ?? [];
  const onRoad = active.filter((j) => ON_THE_ROAD.has(j.status));
  const waiting = active.filter((j) => !ON_THE_ROAD.has(j.status));

  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />
      <div className="at-h2">Tow driver</div>

      {error && <div className="at-errbanner">{error}</div>}

      {data === null && !error ? (
        <div className="at-spin">Loading…</div>
      ) : (
        <>
          {/* The whole point of the screen, said in one line. */}
          <div className={`tds-head${onRoad.length ? ' on' : ''}`}>
            <span className="ic">
              <Truck size={22} strokeWidth={2} />
            </span>
            <div>
              <div className="t">
                {onRoad.length > 0
                  ? `Out on a job${onRoad.length > 1 ? ` · ${onRoad.length} running` : ''}`
                  : waiting.length > 0
                    ? 'Not started yet'
                    : 'No job on right now'}
              </div>
              <div className="s">
                {onRoad.length > 0
                  ? `${onRoad[0]?.driverName ?? 'The driver'} · updated ${ago(onRoad[0]!.updatedAt)}`
                  : waiting.length > 0
                    ? `${waiting.length} booked, waiting for the driver to set off`
                    : 'Nothing booked. Book one from Yards.'}
              </div>
            </div>
          </div>

          {onRoad.map((j) => (
            <TowJobPanel key={j.jobId} job={j} live />
          ))}
          {waiting.map((j) => (
            <TowJobPanel key={j.jobId} job={j} />
          ))}

          {past.length > 0 && (
            <>
              <button
                className="at-chip"
                style={{ marginTop: 18 }}
                onClick={() => setShowPast((v) => !v)}
              >
                {showPast ? 'Hide' : 'Show'} past jobs <span className="n">{past.length}</span>
              </button>
              {showPast && (
                <div style={{ marginTop: 12 }}>
                  {past.map((j) => (
                    <TowJobPanel key={j.jobId} job={j} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

/** One tow, from the office's side: where it is up to, where it is going, and what was photographed. */
function TowJobPanel({ job, live = false }: { job: TowActivityItem; live?: boolean }) {
  const [photos, setPhotos] = useState<TowPhoto[] | null>(null);
  const [open, setOpen] = useState(false);
  const lightbox = useLightbox();

  const total = job.photos.pickup + job.photos.dropOff;

  // Fetched only when the office asks. A board of twenty jobs should not pull every photo list on load.
  async function togglePhotos() {
    const next = !open;
    setOpen(next);
    if (next && photos === null) {
      try {
        setPhotos(await api.get<TowPhoto[]>(`/tow/jobs/${job.jobId}/photos`));
      } catch {
        setPhotos([]);
      }
    }
  }

  const shots: LightboxPhoto[] = (photos ?? []).map((p) => ({
    src: `/api/backend/tow/jobs/${job.jobId}/photos/${p.id}/content`,
    caption: `${job.vehicle?.rego ?? job.reference} · ${
      p.leg === 'pickup' ? 'At pickup' : p.leg === 'dropoff' ? 'At drop-off' : 'Photo'
    } · ${new Date(p.uploadedAt).toLocaleString()}`,
    fileName: p.fileName,
  }));

  const pickupHref = directionsHref(job.pickupAddress);

  return (
    <div className={`at-job${live ? ' live' : ''}`}>
      <div className="at-job-head">
        <div style={{ minWidth: 0 }}>
          <div className="at-job-rego">{job.vehicle?.rego ?? job.reference}</div>
          <div className="at-job-car">
            {[job.vehicle?.make, job.vehicle?.model].filter(Boolean).join(' ') || 'Car'}
            {job.driverName ? ` · ${job.driverName}` : ''}
          </div>
        </div>
        <span className={`at-status ${job.status}`}>{STATUS_LABEL[job.status] ?? job.status}</span>
      </div>

      {/* Where he is headed. Live jobs get it spelled out; finished ones keep it for the record. */}
      <div className="tds-leg">
        <span className="ic">
          <MapPin size={16} />
        </span>
        <div className="body">
          <span className="lab">{job.status === 'en_route' ? 'Driving to' : 'Pick up from'}</span>
          <span className="val">{job.pickupAddress ?? 'No address given'}</span>
        </div>
        {pickupHref && (
          <a className="at-link" href={pickupHref} target="_blank" rel="noopener noreferrer">
            Map
          </a>
        )}
      </div>

      <div className="tds-leg">
        <span className="ic drop">
          <Warehouse size={16} />
        </span>
        <div className="body">
          <span className="lab">Drop off at</span>
          <span className="val">{job.dropOff?.name ?? 'No yard set'}</span>
        </div>
      </div>

      {job.customer && (
        <div className="tds-leg">
          <span className="ic cust">
            <Phone size={16} />
          </span>
          <div className="body">
            <span className="lab">Customer</span>
            <span className="val">{job.customer.name}</span>
          </div>
          {job.customer.phone && (
            <a className="at-link" href={`tel:${job.customer.phone}`}>
              {job.customer.phone}
            </a>
          )}
        </div>
      )}

      <div className="tds-foot">
        <span className="when">Last update {ago(job.updatedAt)}</span>
        <button className="tds-photobtn" onClick={() => void togglePhotos()} disabled={total === 0}>
          <Camera size={15} />
          {total === 0
            ? 'No photos yet'
            : `${total} photo${total === 1 ? '' : 's'}${open ? '' : ' — view'}`}
        </button>
      </div>

      {open && (
        <div className="tds-shots">
          {photos === null ? (
            <span className="at-muted">Loading photos…</span>
          ) : photos.length === 0 ? (
            <span className="at-muted">Nothing uploaded on this job.</span>
          ) : (
            photos.map((p, i) => (
              <button key={p.id} className="tds-thumb" onClick={() => lightbox.open(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shots[i]?.src} alt={p.caption ?? 'Tow photo'} loading="lazy" />
                <span className="leg">
                  {p.leg === 'pickup' ? 'Pickup' : p.leg === 'dropoff' ? 'Drop-off' : 'Photo'}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {lightbox.isOpen && shots.length > 0 && (
        <PhotoLightbox
          photos={shots}
          index={lightbox.index ?? 0}
          onClose={lightbox.close}
          onIndex={lightbox.setIndex}
        />
      )}
    </div>
  );
}
