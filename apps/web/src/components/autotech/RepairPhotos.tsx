'use client';
import { useMemo, useRef, useState } from 'react';
import { Camera, Car, Plus, Search, Upload, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { compressToBase64 } from '@/lib/image';
import {
  addToTray,
  emptyTray,
  isTrayEmpty,
  photosIn,
  removeFromTray,
  stagedPhoto,
  trayCount,
  trayUploads,
  uploadLabel,
  type PhotoTray,
  type StagedPhoto,
} from '@/lib/photo-tray';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

/**
 * Repair photos — enter a rego, then add photos to the car's current job under any category.
 *
 * Photos are STAGED, not uploaded on capture: shoot as many angles as the car needs (the camera button
 * can be tapped over and over, and "Choose" multi-selects from the library), drop any bad shot, then
 * send the whole set with one "Upload" press. Unlimited per category. Any worker on the floor can
 * document any car (the vehicle-profile surface is @AllowStaff), and the category is stored on each
 * photo server-side.
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

/**
 * The categories a car is photographed against on the floor. Must stay in step with PHOTO_CATEGORIES in
 * the API's repair-photos.ts — the caption is the stored value, so a mismatch would silently split a
 * category in two.
 */
const CATEGORIES = [
  { key: 'uncategorized', title: 'Uncategorized', caption: 'Uncategorized' },
  { key: 'check_in', title: 'Check In', caption: 'Check In' },
  { key: 'existing_damage', title: 'Existing damage', caption: 'Existing damage' },
  { key: 'accident_damage', title: 'Accident damage', caption: 'Accident damage' },
  { key: 'supplementary_damage', title: 'Supplementary damage', caption: 'Supplementary damage' },
  { key: 'progress', title: 'Progress', caption: 'Progress' },
  { key: 'handover', title: 'Handover', caption: 'Handover' },
] as const;
type PhaseKey = (typeof CATEGORIES)[number]['key'];

/** Upload order for a staged batch — the order the categories are shown in, not the order filled. */
const CATEGORY_ORDER: readonly PhaseKey[] = CATEGORIES.map((c) => c.key);

/**
 * Photos taken under the original Before/During/After flow. Shown (read-only) when a job actually has
 * them, so history isn't hidden — but not offered for new capture.
 */
const LEGACY_CATEGORIES = [
  { key: 'before', title: 'Before repair', caption: 'Before repair' },
  { key: 'during', title: 'During repair', caption: 'During repair' },
  { key: 'after', title: 'After repair', caption: 'After repair' },
] as const;

const regoOf = (v: SubjectView): string =>
  (typeof v.fields.rego === 'string' && v.fields.rego) || v.label;
const carLine = (v: SubjectView): string => {
  const make = v.fields.make === 'Unknown' ? '' : v.fields.make;
  const model = v.fields.model === 'Unknown' ? '' : v.fields.model;
  if (!make && !model) return ''; // a plain draft — show just the rego
  return [v.fields.year, make, model].filter(Boolean).join(' ');
};

/** A fleet-database car (the real ~thousands-of-cars DB) that isn't a working job car yet. */
interface FleetCar {
  rego: string;
  make: string;
  model: string;
}

export function RepairPhotos() {
  const [rego, setRego] = useState('');
  const [matches, setMatches] = useState<SubjectView[] | null>(null);
  const [fleetCar, setFleetCar] = useState<FleetCar | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [staging, setStaging] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Photos captured but NOT yet sent, grouped by category. Nothing in here has touched the server.
  const [tray, setTray] = useState<PhotoTray<PhaseKey>>(() => emptyTray<PhaseKey>());
  // Two shared inputs: the camera one opens the lens directly, the library one allows a real
  // multi-select. `pendingCat` holds the category the open picker is filling, so adding a category
  // never means adding another ref. `seq` only has to be unique within this screen's tray.
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [pendingCat, setPendingCat] = useState<PhaseKey | null>(null);

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
    setNotFound(null);
    setFleetCar(null);
    try {
      const found = await api.get<SubjectView[]>(`/vehicle-profile?q=${encodeURIComponent(q)}`);
      if (found.length === 1) {
        await loadProfile(found[0]!.id);
        return;
      }
      if (found.length > 1) {
        setMatches(found);
        return;
      }
      // Not a working car yet — look it up in the FLEET database (the real car DB) before giving up.
      const fleet = await api.getOr<FleetCar | null>(
        `/fleet/vehicles/lookup?rego=${encodeURIComponent(q)}`,
        null,
      );
      if (fleet) setFleetCar({ rego: fleet.rego, make: fleet.make, model: fleet.model });
      else setNotFound(q.toUpperCase());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not search — try again.');
    } finally {
      setSearching(false);
    }
  }

  /** Open a car for repair photos — a fleet car (seed its make/model) or a blank draft — creating or
   *  reusing its working record (subject + draft job) so photos can attach. */
  async function openCar(info: { rego: string; make?: string; model?: string }): Promise<void> {
    setCreating(true);
    setErr(null);
    try {
      const c = await api.post<{ vehicleId: string }>('/vehicle-profile/draft', info);
      await loadProfile(c.vehicleId);
      setNotFound(null);
      setFleetCar(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not open the car — try again.');
    } finally {
      setCreating(false);
    }
  }

  /**
   * Compress the picked files into the tray. Deliberately does NOT upload — that's `uploadAll`, on the
   * worker's press, once they've seen what they actually captured.
   */
  async function stageFiles(cat: PhaseKey, files: FileList): Promise<void> {
    setErr(null);
    setStaging(true);
    try {
      const picked: StagedPhoto[] = [];
      let unreadable = 0;
      for (const f of Array.from(files)) {
        try {
          const { dataBase64, contentType } = await compressToBase64(f);
          seq.current += 1;
          picked.push(stagedPhoto(`s${seq.current}`, dataBase64, contentType, f.name));
        } catch {
          unreadable += 1;
        }
      }
      if (picked.length > 0) setTray((t) => addToTray(t, cat, picked).tray);
      if (unreadable > 0)
        setErr(
          unreadable === 1
            ? 'One photo could not be read and was skipped.'
            : `${unreadable} photos could not be read and were skipped.`,
        );
    } finally {
      setStaging(false);
      setPendingCat(null);
      if (cameraInput.current) cameraInput.current.value = '';
      if (libraryInput.current) libraryInput.current.value = '';
    }
  }

  /** Send every staged photo, then re-pull the profile once so thumbnails come from the server. */
  async function uploadAll(): Promise<void> {
    if (!profile || !jobId || isTrayEmpty(tray)) return;
    setErr(null);
    setUploading(true);
    const queue = trayUploads(tray, CATEGORY_ORDER);
    let sent = 0;
    try {
      for (const { key, photo } of queue) {
        await api.post(`/vehicle-profile/${profile.vehicle.id}/photos`, {
          phase: key,
          dataBase64: photo.dataBase64,
          contentType: photo.contentType,
          jobId,
        });
        // Un-stage each photo as it lands, so a failure part-way through leaves exactly the un-sent
        // ones in the tray — a retry can't duplicate what already went up.
        setTray((t) => removeFromTray(t, key, photo.id));
        sent += 1;
      }
    } catch (e) {
      const detail = e instanceof ApiError ? e.message : 'Could not upload — try again.';
      setErr(
        sent > 0
          ? `${detail} (${sent} of ${queue.length} uploaded — the rest are still here.)`
          : detail,
      );
    } finally {
      setUploading(false);
      // Even a partial run changed the job, so re-pull to show what did land. Guarded: `loadProfile`
      // can throw, and an exception raised in `finally` would escape as an unhandled rejection and
      // bury whatever upload error we just reported.
      if (sent > 0) {
        try {
          await loadProfile(profile.vehicle.id);
        } catch {
          setErr(
            'Photos uploaded, but the page could not refresh — search the rego again to see them.',
          );
        }
      }
    }
  }

  /** Open a picker for a category (the shared inputs read `pendingCat` on change). */
  function pickFor(cat: PhaseKey, source: 'camera' | 'library'): void {
    setPendingCat(cat);
    (source === 'camera' ? cameraInput : libraryInput).current?.click();
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
          Enter the car’s registration, then add photos to its job under any category.
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

        {fleetCar && (
          <div className="at-empty" style={{ marginTop: 16, textAlign: 'left' }}>
            <div className="at-note">Found in the fleet database:</div>
            <div style={{ marginTop: 2, fontSize: 18, fontWeight: 700 }}>
              {[fleetCar.make, fleetCar.model].filter(Boolean).join(' ') || 'Vehicle'}
              <span style={{ color: '#8a8a8e', fontWeight: 600 }}> · {fleetCar.rego}</span>
            </div>
            <button
              className="at-btn primary"
              style={{ marginTop: 12 }}
              disabled={creating}
              onClick={() =>
                void openCar({ rego: fleetCar.rego, make: fleetCar.make, model: fleetCar.model })
              }
            >
              <Car size={18} /> {creating ? 'Opening…' : 'Use this car'}
            </button>
          </div>
        )}

        {notFound && (
          <div className="at-empty" style={{ marginTop: 16, textAlign: 'left' }}>
            <div>
              No car found for <b>{notFound}</b>.
            </div>
            <div className="at-note" style={{ marginTop: 4 }}>
              Start a draft with this registration — make &amp; model can be filled in later.
            </div>
            <button
              className="at-btn primary"
              style={{ marginTop: 12 }}
              disabled={creating}
              onClick={() => void openCar({ rego: notFound })}
            >
              <Plus size={18} strokeWidth={2.6} /> {creating ? 'Adding…' : `Add car ${notFound}`}
            </button>
          </div>
        )}
      </>
    );
  }

  // ---- Screen 2: add photos ----
  const v = profile.vehicle;
  const staged = trayCount(tray);
  // One flag for every control: mid-upload or mid-compress, nothing else should be pressable.
  const busy = uploading || staging;
  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />

      {/* Both of these change which job a staged photo would land on, so neither is allowed while the
          tray has something in it — an evidence photo filed against the wrong car is worse than a
          blocked button, and "Discard" in the upload bar is always an exit. */}
      <button
        className="at-back-link"
        disabled={staged > 0 || busy}
        title={staged > 0 ? 'Upload or discard the staged photos first' : undefined}
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
              disabled={staged > 0 || busy}
              title={staged > 0 ? 'Upload or discard the staged photos first' : undefined}
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
        CATEGORIES.map((ph) => {
          const shots = photosFor(ph.caption);
          const waiting = photosIn(tray, ph.key);
          return (
            <div key={ph.key} className="at-phase">
              <div className="at-phase-head">
                <span className="t">{ph.title}</span>
                <span className="c">
                  {waiting.length > 0 ? `${shots.length} + ${waiting.length}` : shots.length}
                </span>
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
                {/* Staged shots sit alongside the uploaded ones, outlined, each one droppable. */}
                {waiting.map((sp) => (
                  <div key={sp.id} className="at-photothumb pending" title="Not uploaded yet">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sp.preview} alt={`${ph.title} photo, waiting to upload`} />
                    <button
                      type="button"
                      className="rm"
                      aria-label={`Remove this ${ph.title} photo`}
                      disabled={busy}
                      onClick={() => setTray((t) => removeFromTray(t, ph.key, sp.id))}
                    >
                      <X size={14} strokeWidth={3} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="at-photoadd"
                  disabled={busy}
                  onClick={() => pickFor(ph.key, 'camera')}
                >
                  <Camera size={26} strokeWidth={2} />
                  <span>{shots.length || waiting.length ? 'Take more' : 'Take photos'}</span>
                </button>
                <button
                  type="button"
                  className="at-photoadd"
                  disabled={busy}
                  onClick={() => pickFor(ph.key, 'library')}
                >
                  <Upload size={26} strokeWidth={2} />
                  <span>Choose</span>
                </button>
              </div>
            </div>
          );
        })}

      {/* Photos from the old Before/During/After flow — shown only when this job has some. */}
      {activeJob &&
        LEGACY_CATEGORIES.map((ph) => {
          const shots = photosFor(ph.caption);
          if (shots.length === 0) return null;
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
              </div>
            </div>
          );
        })}

      {/* The batch action. Sticky, because the categories make a long page and the photos a worker just
          took are worth nothing until these go up. */}
      {activeJob && staged > 0 && (
        <div className="at-uploadbar">
          <div className="t">
            {staged === 1 ? '1 photo ready' : `${staged} photos ready`} · not uploaded yet
          </div>
          <div className="a">
            <button className="at-btn primary" disabled={busy} onClick={() => void uploadAll()}>
              {uploading ? (
                <span className="at-spin" />
              ) : (
                <>
                  <Upload size={18} /> {uploadLabel(tray)}
                </>
              )}
            </button>
            <button
              className="at-btn ghost"
              disabled={busy}
              onClick={() => setTray(emptyTray<PhaseKey>())}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Two shared pickers — `pendingCat` says which category they're filling. The camera one goes
          straight to the lens; Android Chrome ignores `multiple` there and returns a single shot per
          tap, which is exactly why photos stage instead of uploading. The library one has no
          `capture`, so a genuine multi-select works on every platform. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length && pendingCat) void stageFiles(pendingCat, e.target.files);
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length && pendingCat) void stageFiles(pendingCat, e.target.files);
        }}
      />
    </>
  );
}
