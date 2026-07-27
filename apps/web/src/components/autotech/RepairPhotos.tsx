'use client';
import { useMemo, useRef, useState } from 'react';
import { Camera, Car, Search } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { compressToBase64 } from '@/lib/image';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

/**
 * Repair photos — enter a rego, then add Before / During / After photos to the car's current job.
 * Unlimited photos per phase ("Add more" is always there). Any worker on the floor can document any car
 * (the vehicle-profile surface is @AllowStaff), and the phase is stored on each photo server-side.
 */

interface SubjectView {
  id: string;
  label: string;
  fields: Record<string, unknown>;
}
interface JobSummary {
  id: string;
  reference: string;
  stateName: string;
  isOpen: boolean;
}
interface Attachment {
  id: string;
  workItemId: string;
  caption: string | null;
}
interface VehicleProfile {
  vehicle: SubjectView;
  currentJob: JobSummary | null;
  jobs: JobSummary[];
  photos: Attachment[];
}

const PHASES = [
  { key: 'before', title: 'Before repair', caption: 'Before repair' },
  { key: 'during', title: 'During repair', caption: 'During repair' },
  { key: 'after', title: 'After repair', caption: 'After repair' },
] as const;
type PhaseKey = (typeof PHASES)[number]['key'];

const regoOf = (v: SubjectView): string =>
  (typeof v.fields.rego === 'string' && v.fields.rego) || v.label;
const carLine = (v: SubjectView): string => {
  const make = v.fields.make === 'Unknown' ? '' : v.fields.make;
  const model = v.fields.model === 'Unknown' ? '' : v.fields.model;
  if (!make && !model) return ''; // a plain draft — show just the rego
  return [v.fields.year, make, model].filter(Boolean).join(' ');
};

export function RepairPhotos() {
  const [rego, setRego] = useState('');
  const [matches, setMatches] = useState<SubjectView[] | null>(null);
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState<PhaseKey | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputs = {
    before: useRef<HTMLInputElement>(null),
    during: useRef<HTMLInputElement>(null),
    after: useRef<HTMLInputElement>(null),
  };

  const openJobs = useMemo(() => profile?.jobs.filter((j) => j.isOpen) ?? [], [profile]);
  const activeJob = useMemo(
    () => profile?.jobs.find((j) => j.id === jobId) ?? null,
    [profile, jobId],
  );

  async function loadProfile(vehicleId: string): Promise<void> {
    const p = await api.get<VehicleProfile>(`/vehicle-profile/${vehicleId}`);
    setProfile(p);
    setMatches(null);
    const target = p.currentJob ?? p.jobs[0] ?? null;
    setJobId(target?.id ?? null);
  }

  async function search(): Promise<void> {
    const q = rego.trim();
    if (!q) return;
    setSearching(true);
    setErr(null);
    setProfile(null);
    setMatches(null);
    try {
      const found = await api.get<SubjectView[]>(`/vehicle-profile?q=${encodeURIComponent(q)}`);
      if (found.length === 0) {
        setErr(`No car found for “${q}”. Check the plate and try again.`);
      } else if (found.length === 1) {
        await loadProfile(found[0]!.id);
      } else {
        setMatches(found);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not search — try again.');
    } finally {
      setSearching(false);
    }
  }

  async function addPhotos(phase: PhaseKey, files: FileList): Promise<void> {
    if (!profile || !jobId) return;
    setErr(null);
    setUploading(phase);
    try {
      for (const f of Array.from(files)) {
        const { dataBase64, contentType } = await compressToBase64(f);
        await api.post(`/vehicle-profile/${profile.vehicle.id}/photos`, {
          phase,
          dataBase64,
          contentType,
          jobId,
        });
      }
      await loadProfile(profile.vehicle.id); // re-pull so the new thumbnails show
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not upload — try again.');
    } finally {
      setUploading(null);
      const ref = inputs[phase].current;
      if (ref) ref.value = '';
    }
  }

  function photosFor(caption: string): Attachment[] {
    if (!profile || !jobId) return [];
    return profile.photos.filter((p) => p.workItemId === jobId && p.caption === caption);
  }

  // ---- Screen 1: enter registration ----
  if (!profile) {
    return (
      <>
        <AtTopbar backHref="/" right={<SignOutButton />} />
        <div className="at-h2">Repair photos</div>
        <div className="at-note">
          Enter the car’s registration, then add before / during / after photos to its job.
        </div>

        {err && <div className="at-errbanner">{err}</div>}

        <div className="at-field" style={{ marginTop: 10 }}>
          <div className="at-flabel">Registration</div>
          <input
            className="at-input rego"
            value={rego}
            onChange={(e) => setRego(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
            placeholder="1XY 4KP"
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
          />
        </div>
        <button
          className="at-btn primary"
          style={{ marginTop: 12 }}
          disabled={searching || !rego.trim()}
          onClick={() => void search()}
        >
          <Search size={18} /> {searching ? 'Searching…' : 'Find car'}
        </button>

        {matches && (
          <>
            <div className="at-note" style={{ marginTop: 16 }}>
              Which car?
            </div>
            <div className="at-list" style={{ marginTop: 6 }}>
              {matches.map((m) => (
                <div key={m.id} className="at-lrow" onClick={() => void loadProfile(m.id)}>
                  <span className="ic">
                    <Car size={22} strokeWidth={2} color="#fff" />
                  </span>
                  <div className="body">
                    <div className="ti">{regoOf(m)}</div>
                    <div className="st">{carLine(m) || 'Vehicle'}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  // ---- Screen 2: add photos ----
  const v = profile.vehicle;
  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />

      <button
        className="at-back-link"
        onClick={() => {
          setProfile(null);
          setJobId(null);
        }}
      >
        ‹ Search another rego
      </button>

      <div className="at-carhead">
        <div className="at-carrego">{regoOf(v)}</div>
        {carLine(v) && <div className="at-carsub">{carLine(v)}</div>}
      </div>

      {activeJob ? (
        <div className="at-note" style={{ marginTop: 2 }}>
          Adding to job <b>{activeJob.reference}</b> · {activeJob.stateName}
        </div>
      ) : (
        <div className="at-empty" style={{ marginTop: 12 }}>
          This car has no job yet — start a job before adding repair photos.
        </div>
      )}

      {openJobs.length > 1 && (
        <div className="at-chips" style={{ marginTop: 8 }}>
          {openJobs.map((j) => (
            <button
              key={j.id}
              className={`at-chip${j.id === jobId ? ' on' : ''}`}
              onClick={() => setJobId(j.id)}
            >
              <span className="n">{j.reference}</span>
            </button>
          ))}
        </div>
      )}

      {err && (
        <div className="at-errbanner" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}

      {activeJob &&
        PHASES.map((ph) => {
          const shots = photosFor(ph.caption);
          return (
            <div key={ph.key} className="at-phase">
              <div className="at-phase-head">
                <span className="t">{ph.title}</span>
                <span className="c">{shots.length}</span>
              </div>
              <div className="at-photorow">
                {shots.map((s) => (
                  <div key={s.id} className="at-photothumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/backend/vehicle-profile/${v.id}/photos/${s.id}/content`}
                      alt={`${ph.title} photo`}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="at-photoadd"
                  disabled={uploading !== null}
                  onClick={() => inputs[ph.key].current?.click()}
                >
                  {uploading === ph.key ? (
                    <span className="at-spin" />
                  ) : (
                    <>
                      <Camera size={26} strokeWidth={2} />
                      <span>{shots.length ? 'Add more' : 'Add photos'}</span>
                    </>
                  )}
                </button>
              </div>
              <input
                ref={inputs[ph.key]}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.length) void addPhotos(ph.key, e.target.files);
                }}
              />
            </div>
          );
        })}
    </>
  );
}
