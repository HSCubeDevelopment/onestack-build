'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Wrench,
  StickyNote,
  ArrowUpRight,
  ArrowDownLeft,
  ImageOff,
  Sparkles,
  ReceiptText,
  ChevronRight,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';
import { RegoInput } from '@/components/fleet/RegoInput';
import { HIDDEN_FROM_STAFF } from '@/lib/staff-features';
import { LiveLocation } from '@/components/LiveLocation';
import { PhotoLightbox, useLightbox, type LightboxPhoto } from '@/components/PhotoLightbox';

/**
 * Car history — a rego search on top, and beneath it a live DIRECTORY of everything moving through the
 * yard: courtesy-car movements (in / out), tickets and jobs, newest first, across every car. Tapping any
 * row with a rego drills into that car's full record (photos + estimates + jobs + In/Out), which is also
 * what the search does. So it's both "look up one car" and "see what's happening" in one screen.
 */

interface SubjectView {
  id: string;
  label: string;
  fields: Record<string, unknown>;
}
interface Attachment {
  id: string;
  caption: string | null;
}
interface TimelineEvent {
  type: string;
  at: string;
  jobReference: string;
  summary: string;
}
interface JobRow {
  id: string;
  reference: string;
  stateName: string;
}
interface VehicleProfile {
  vehicle: SubjectView;
  photos: Attachment[];
  timeline: TimelineEvent[];
  jobs: JobRow[];
  /** How many times this car has been serviced. 0 means there is no service screen to offer. */
  serviceCount?: number;
}
interface FleetVehicle {
  id: string;
  rego: string;
  make: string;
  model: string;
  status: string;
}
interface RentalPeriod {
  movementId: string | null;
  driverName: string;
  outAt: string | null;
  backAt: string | null;
}
interface FleetPhoto {
  id: string;
  photoType: string;
}

/** A row in the cross-car directory feed (GET /activity/feed). */
interface ActivityEvent {
  at: string;
  kind: 'in' | 'out' | 'ticket' | 'job';
  rego: string;
  title: string;
  subtitle: string;
  ref: string;
}

interface PhotoItem {
  url: string;
  label: string;
}
interface Event {
  at: string;
  kind: 'job' | 'note' | 'out' | 'in';
  title: string;
}

const cleanUnknown = (s: unknown): string => (s === 'Unknown' || !s ? '' : String(s));
const carLine = (fields: Record<string, unknown>): string => {
  const make = cleanUnknown(fields.make);
  const model = cleanUnknown(fields.model);
  if (!make && !model) return '';
  return [fields.year, make, model].filter(Boolean).join(' ');
};
const fmt = (iso: string): string =>
  new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export function CarHistory() {
  const [rego, setRego] = useState('');
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [feed, setFeed] = useState<ActivityEvent[] | null>(null);
  const router = useRouter();
  const lightbox = useLightbox();
  const [loaded, setLoaded] = useState<{
    rego: string;
    line: string;
    photos: PhotoItem[];
    events: Event[];
    jobs: JobRow[];
    /** Kept so the service-history button knows the vehicle id and whether to appear at all. */
    profile: VehicleProfile | null;
  } | null>(null);

  useEffect(() => {
    void api.getOr<ActivityEvent[]>('/activity/feed?limit=40', []).then(setFeed);
  }, []);

  /*
   * Open a car straight from the URL.
   *
   * Without this the screen is only reachable by typing, so anything linking back to a car — the
   * service-history screen's back button, a shared link, a browser Back — lands on an empty search box
   * and the car has to be looked up again.
   */
  const searchParams = useSearchParams();
  const regoParam = (searchParams.get('rego') ?? '').toUpperCase();
  useEffect(() => {
    if (!regoParam) return;
    setRego(regoParam);
    void view(regoParam);
    // Only when the URL changes — re-running on every render would refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regoParam]);

  async function view(override?: string): Promise<void> {
    const q = (override ?? rego).trim();
    if (!q) return;
    setSearching(true);
    setErr(null);
    setLoaded(null);
    try {
      // Pack "vehicle" 360 (jobs / estimates / repair photos / timeline).
      const subjects = await api.get<SubjectView[]>(`/vehicle-profile?q=${encodeURIComponent(q)}`);
      const profile = subjects[0]
        ? await api.get<VehicleProfile>(`/vehicle-profile/${subjects[0].id}`)
        : null;

      // Fleet record (In/Out movements + fleet handover photos).
      const fleet = await api.getOr<FleetVehicle | null>(
        `/fleet/vehicles/lookup?rego=${encodeURIComponent(q)}`,
        null,
      );
      const rentals = fleet
        ? await api.getOr<RentalPeriod[]>(
            `/fleet/vehicles/history?rego=${encodeURIComponent(q)}`,
            [],
          )
        : [];
      const fleetPhotos = fleet
        ? await api.getOr<FleetPhoto[]>(`/fleet/photos?vehicleId=${fleet.id}`, [])
        : [];

      if (!profile && !fleet) {
        setErr(`No car found for “${q.toUpperCase()}”.`);
        return;
      }

      const photos: PhotoItem[] = [
        ...(profile?.photos ?? []).map((p) => ({
          url: `/api/backend/vehicle-profile/${profile!.vehicle.id}/photos/${p.id}/content`,
          label: p.caption ?? 'Photo',
        })),
        ...fleetPhotos.map((p) => ({
          url: `/api/backend/fleet/photos/${p.id}/content`,
          label: p.photoType.replace(/_/g, ' '),
        })),
      ];

      const events: Event[] = [];
      for (const e of profile?.timeline ?? []) {
        events.push({ at: e.at, kind: e.type === 'note' ? 'note' : 'job', title: e.summary });
      }
      for (const r of rentals) {
        if (r.outAt) events.push({ at: r.outAt, kind: 'out', title: `Out to ${r.driverName}` });
        if (r.backAt)
          events.push({ at: r.backAt, kind: 'in', title: `Returned by ${r.driverName}` });
      }
      events.sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first

      const rego2 = cleanUnknown(profile?.vehicle.fields.rego) || fleet?.rego || q.toUpperCase();
      const line = profile
        ? carLine(profile.vehicle.fields)
        : fleet
          ? [fleet.make, fleet.model].filter((x) => cleanUnknown(x)).join(' ')
          : '';
      setLoaded({ rego: rego2, line, photos, events, jobs: profile?.jobs ?? [], profile });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load history — try again.');
    } finally {
      setSearching(false);
    }
  }

  function openRego(r: string): void {
    setRego(r.toUpperCase());
    void view(r);
  }

  const EventIcon = ({ kind }: { kind: Event['kind'] }) => {
    if (kind === 'out') return <ArrowUpRight size={18} />;
    if (kind === 'in') return <ArrowDownLeft size={18} />;
    if (kind === 'note') return <StickyNote size={18} />;
    return <Wrench size={18} />;
  };

  const FeedIcon = ({ kind }: { kind: ActivityEvent['kind'] }) => {
    if (kind === 'out') return <ArrowUpRight size={18} />;
    if (kind === 'in') return <ArrowDownLeft size={18} />;
    if (kind === 'ticket') return <ReceiptText size={18} />;
    return <Wrench size={18} />;
  };

  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />

      {!loaded ? (
        <>
          <div className="at-h2">Car history</div>
          <div className="at-note">
            Search a registration to see everything on that car — or browse the whole yard below.
          </div>
          {err && <div className="at-errbanner">{err}</div>}
          <RegoInput
            label="Registration"
            value={rego}
            onChange={setRego}
            onPick={(r) => void view(r)}
            onEnter={() => void view()}
            autoFocus
          />
          <button
            className="at-btn primary"
            style={{ marginTop: 12 }}
            disabled={searching || !rego.trim()}
            onClick={() => void view()}
          >
            <Search size={18} /> {searching ? 'Loading…' : 'View history'}
          </button>

          {/* Directory: everything across the yard, newest first */}
          <div className="at-phase-head" style={{ marginTop: 22 }}>
            <span className="t">Recent activity</span>
            {feed && <span className="c">{feed.length}</span>}
          </div>
          {feed === null ? (
            <div className="at-spin">Loading…</div>
          ) : feed.length === 0 ? (
            <div className="at-empty">Nothing recorded yet.</div>
          ) : (
            <div className="at-timeline">
              {feed.map((e, i) => {
                const inner = (
                  <>
                    <span className="ic">
                      <FeedIcon kind={e.kind} />
                    </span>
                    <div className="body">
                      <div className="ti">
                        {e.rego && <b>{e.rego}</b>}
                        {e.rego ? ' · ' : ''}
                        {e.title}
                      </div>
                      {e.subtitle && <div className="dt">{e.subtitle}</div>}
                      <div className="dt">{fmt(e.at)}</div>
                    </div>
                  </>
                );
                // Job rows open the job-detail page; car rows drill into that car; others are static.
                if (e.kind === 'job') {
                  return (
                    <Link
                      key={i}
                      href={`/inout/job/${e.ref}`}
                      className="at-tlrow job"
                      style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <div
                    key={i}
                    className={`at-tlrow ${e.kind}`}
                    style={e.rego ? { cursor: 'pointer' } : undefined}
                    onClick={() => e.rego && openRego(e.rego)}
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <button
            className="at-back-link"
            onClick={() => {
              setLoaded(null);
              setRego('');
            }}
          >
            ‹ Back to directory
          </button>
          <div className="at-carhead">
            <div className="at-carrego">{loaded.rego}</div>
            {loaded.line && <div className="at-carsub">{loaded.line}</div>}
          </div>

          {/* Where the car is now. This is the screen staff actually search a rego on, so the map
              belongs here as much as on the owner's car record. */}
          <LiveLocation rego={loaded.rego} />

          {/* Servicing has its own screen — it is a different question from "what happened to this
              car", and its records are far too many to sit in the activity feed. Offered only when
              there is something behind it. */}
          {(loaded.profile?.serviceCount ?? 0) > 0 && loaded.profile && (
            <button
              className="sv-enter"
              onClick={() =>
                router.push(
                  `/inout/service-history?vehicleId=${encodeURIComponent(
                    loaded.profile!.vehicle.id,
                  )}&rego=${encodeURIComponent(loaded.rego)}`,
                )
              }
            >
              <span className="ic">
                <Wrench size={20} strokeWidth={2} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t" style={{ display: 'block' }}>
                  Service history
                </span>
                <span className="s" style={{ display: 'block' }}>
                  {loaded.profile.serviceCount} service
                  {loaded.profile.serviceCount === 1 ? '' : 's'} recorded · what was done &amp;
                  photos
                </span>
              </span>
              <ChevronRight size={18} strokeWidth={2.5} style={{ opacity: 0.35, flex: 'none' }} />
            </button>
          )}

          {!HIDDEN_FROM_STAFF.instantEstimate && (
            <Link
              href={`/inout/estimate?rego=${encodeURIComponent(loaded.rego)}`}
              className="at-btn ghost"
              style={{ marginTop: 10, display: 'inline-flex', width: 'auto' }}
            >
              <Sparkles size={16} /> New / update estimate
            </Link>
          )}

          {/* Jobs — tap through to the full job detail */}
          {loaded.jobs.length > 0 && (
            <>
              <div className="at-phase-head" style={{ marginTop: 16 }}>
                <span className="t">Jobs</span>
                <span className="c">{loaded.jobs.length}</span>
              </div>
              {loaded.jobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/inout/job/${j.id}`}
                  className="at-tk"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="hd">
                    <div className="ty">
                      <Wrench size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                      Job {j.reference}
                    </div>
                    <span className="at-badge gray">{j.stateName}</span>
                  </div>
                </Link>
              ))}
            </>
          )}

          {/* Photos */}
          <div className="at-phase-head" style={{ marginTop: 14 }}>
            <span className="t">Photos</span>
            <span className="c">{loaded.photos.length}</span>
          </div>
          {loaded.photos.length === 0 ? (
            <div className="at-empty" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ImageOff size={18} /> No photos on record yet.
            </div>
          ) : (
            <div className="at-photorow">
              {/* Tappable: this is the screen the shop looks a car up on, and a 90px tile is no use
                  for seeing what it is actually a photo of. */}
              {loaded.photos.map((p, i) => (
                <button
                  key={i}
                  className="at-photothumb"
                  title={p.label}
                  onClick={() => lightbox.open(i)}
                  aria-label={`Open ${p.label}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.label} />
                </button>
              ))}
            </div>
          )}

          {lightbox.isOpen && loaded.photos.length > 0 && (
            <PhotoLightbox
              photos={loaded.photos.map((p): LightboxPhoto => ({
                src: p.url,
                caption: `${loaded.rego} · ${p.label}`,
                fileName: `${loaded.rego}-${p.label.replace(/\s+/g, '-').toLowerCase()}.jpg`,
              }))}
              index={lightbox.index ?? 0}
              onClose={lightbox.close}
              onIndex={lightbox.setIndex}
            />
          )}

          {/* Activity */}
          <div className="at-phase-head" style={{ marginTop: 18 }}>
            <span className="t">Activity</span>
            <span className="c">{loaded.events.length}</span>
          </div>
          {loaded.events.length === 0 ? (
            <div className="at-empty">Nothing recorded against this car yet.</div>
          ) : (
            <div className="at-timeline">
              {loaded.events.map((e, i) => (
                <div key={i} className={`at-tlrow ${e.kind}`}>
                  <span className="ic">
                    <EventIcon kind={e.kind} />
                  </span>
                  <div className="body">
                    <div className="ti">{e.title}</div>
                    <div className="dt">{fmt(e.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
