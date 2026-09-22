'use client';
import { useMemo, useRef, useState } from 'react';
import { Camera, Check, ClipboardList, Wrench } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { compressToBase64 } from '@/lib/image';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';
import { RegoInput } from '@/components/fleet/RegoInput';
import { PhotoLightbox, useLightbox, type LightboxPhoto } from '@/components/PhotoLightbox';
import { buildWorkNote, WORK_MENU } from '@/lib/mechanics';

interface SubjectView {
  id: string;
  label: string;
  fields?: Record<string, unknown>;
}
interface JobSummary {
  id: string;
  reference: string;
  stateName: string;
  isOpen?: boolean;
}
interface Attachment {
  id: string;
  workItemId: string | null;
  caption: string | null;
  createdAt: string;
}
interface VehicleProfile {
  vehicle: SubjectView;
  currentJob: JobSummary | null;
  jobs: JobSummary[];
  photos: Attachment[];
}
interface FleetCar {
  rego: string;
  make: string;
  model: string;
}

/** The two ends of a service, as this screen records them. Matches the API's PHOTO_CATEGORIES. */
const BEFORE = 'service_before';
const AFTER = 'service_after';
const CAPTION = { [BEFORE]: 'Before service', [AFTER]: 'After service' } as const;

/**
 * Log a service — the screen that replaces the WhatsApp group.
 *
 * What Manga and Jot do today: photograph the car, post the shots with the rego, then type what was
 * done underneath. Roughly 3,900 messages of it. The order here is deliberately the same — rego,
 * before photos, work, after photos — because the habit is the process, and a screen that asks for
 * things in a different order than the job happens gets filled in wrong or not at all.
 *
 * The work list is tappable because they are wearing gloves. Their real vocabulary is in
 * lib/mechanics.ts, taken from what they actually typed; the free-text box catches the rest.
 */
export function MechanicWork() {
  const [rego, setRego] = useState('');
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [fleetCar, setFleetCar] = useState<FleetCar | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [uploading, setUploading] = useState<string | null>(null);
  const pendingPhase = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lightbox = useLightbox();
  const [lightboxSet, setLightboxSet] = useState<LightboxPhoto[]>([]);

  async function loadProfile(vehicleId: string): Promise<void> {
    const p = await api.get<VehicleProfile>(`/vehicle-profile/${vehicleId}`);
    setProfile(p);
    setJobId(p.currentJob?.id ?? p.jobs[0]?.id ?? null);
  }

  /** Find the car, or offer to open it. Same resolution the repair-photos screen uses. */
  async function find(override?: string): Promise<void> {
    const q = (override ?? rego).trim();
    if (!q) return;
    setSearching(true);
    setErr(null);
    setNotFound(null);
    setFleetCar(null);
    setProfile(null);
    setSaved(false);
    try {
      const found = await api.get<SubjectView[]>(`/vehicle-profile?q=${encodeURIComponent(q)}`);
      if (found[0]) {
        await loadProfile(found[0].id);
        return;
      }
      // Not a working car yet — check the fleet database so we can seed its make and model.
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

  /** Open (or reuse) the car's working record so photos and notes have somewhere to attach. */
  async function openCar(info: { rego: string; make?: string; model?: string }): Promise<void> {
    setSearching(true);
    setErr(null);
    try {
      const c = await api.post<{ vehicleId: string }>('/vehicle-profile/draft', info);
      await loadProfile(c.vehicleId);
      setNotFound(null);
      setFleetCar(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not open the car — try again.');
    } finally {
      setSearching(false);
    }
  }

  function pickFor(phase: string): void {
    pendingPhase.current = phase;
    fileInput.current?.click();
  }

  async function addPhotos(files: FileList | null): Promise<void> {
    const phase = pendingPhase.current;
    if (!files?.length || !phase || !profile || !jobId) return;
    setErr(null);
    setUploading(phase);
    try {
      for (const f of Array.from(files)) {
        const { dataBase64, contentType } = await compressToBase64(f, 1600);
        await api.post(`/vehicle-profile/${profile.vehicle.id}/photos`, {
          phase,
          dataBase64,
          contentType,
          jobId,
        });
      }
      await loadProfile(profile.vehicle.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not upload — try again.');
    } finally {
      setUploading(null);
      pendingPhase.current = null;
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const shotsFor = (phase: keyof typeof CAPTION): Attachment[] =>
    (profile?.photos ?? []).filter((p) => p.workItemId === jobId && p.caption === CAPTION[phase]);

  function openShots(phase: keyof typeof CAPTION, i: number): void {
    const set = shotsFor(phase).map((p) => ({
      src: `/api/backend/vehicle-profile/${profile!.vehicle.id}/photos/${p.id}/content`,
      caption: `${rego || profile?.vehicle.label} · ${CAPTION[phase]}`,
      fileName: `${rego || 'car'}-${phase}.jpg`,
    }));
    setLightboxSet(set);
    lightbox.open(i);
  }

  const toggle = (item: string) =>
    setPicked((p) => (p.includes(item) ? p.filter((x) => x !== item) : [...p, item]));

  const note = useMemo(() => buildWorkNote(picked, extra), [picked, extra]);
  const canSave = Boolean(profile && jobId && note.trim() && !saving);

  async function save(): Promise<void> {
    if (!jobId || !note.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/work-items/${jobId}/notes`, { body: note });
      setSaved(true);
      setPicked([]);
      setExtra('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the work — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />
      <div className="at-h2">Log work</div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => void addPhotos(e.target.files)}
      />

      <RegoInput
        label="Registration"
        value={rego}
        onChange={(r) => {
          setRego(r);
          setSaved(false);
        }}
        onPick={(r) => void find(r)}
        onEnter={() => void find()}
        autoFocus
      />

      {!profile && (
        <button
          className="at-btn primary"
          style={{ marginTop: 12 }}
          disabled={searching || !rego.trim()}
          onClick={() => void find()}
        >
          {searching ? 'Looking…' : 'Find the car'}
        </button>
      )}

      {err && <div className="at-errbanner">{err}</div>}

      {/* Car is not on the floor yet — offer to open it rather than dead-ending. */}
      {fleetCar && (
        <div className="mw-offer">
          <div className="t">
            {fleetCar.rego} · {[fleetCar.make, fleetCar.model].filter(Boolean).join(' ')}
          </div>
          <div className="s">Not opened for work yet.</div>
          <button
            className="at-btn primary"
            disabled={searching}
            onClick={() => void openCar(fleetCar)}
          >
            Start work on this car
          </button>
        </div>
      )}
      {notFound && (
        <div className="mw-offer">
          <div className="t">{notFound}</div>
          <div className="s">No car on record with that rego.</div>
          <button
            className="at-btn primary"
            disabled={searching}
            onClick={() => void openCar({ rego: notFound })}
          >
            Add it and start work
          </button>
        </div>
      )}

      {profile && (
        <>
          <div className="mw-car">
            <Wrench size={16} />
            <span>{profile.vehicle.label}</span>
          </div>

          <PhotoStrip
            title="Before"
            hint="Photograph the car as it arrived"
            shots={shotsFor(BEFORE)}
            vehicleId={profile.vehicle.id}
            busy={uploading === BEFORE}
            onAdd={() => pickFor(BEFORE)}
            onOpen={(i) => openShots(BEFORE, i)}
          />

          {/* ---- what was done ---- */}
          <div className="mw-sec">
            <ClipboardList size={14} /> What was done
            {picked.length > 0 && <span className="n">{picked.length}</span>}
          </div>

          {WORK_MENU.map((g) => (
            <div key={g.title} className="mw-group">
              <div className="mw-grouptitle">{g.title}</div>
              <div className="at-chips">
                {g.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`at-chip${picked.includes(item) ? ' on' : ''}`}
                    onClick={() => {
                      toggle(item);
                      setSaved(false);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <textarea
            className="at-input"
            style={{ minHeight: 88, marginTop: 6 }}
            placeholder="Anything else — parts used, what you found, what still needs doing"
            value={extra}
            onChange={(e) => {
              setExtra(e.target.value);
              setSaved(false);
            }}
          />

          <PhotoStrip
            title="After"
            hint="Photograph it finished"
            shots={shotsFor(AFTER)}
            vehicleId={profile.vehicle.id}
            busy={uploading === AFTER}
            onAdd={() => pickFor(AFTER)}
            onOpen={(i) => openShots(AFTER, i)}
          />

          <button
            className="at-btn primary"
            style={{ marginTop: 16 }}
            disabled={!canSave}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save the work'}
          </button>
          {saved && (
            <p className="at-muted" style={{ marginTop: 8 }}>
              Recorded against {profile.vehicle.label}. Photos are already saved as you take them.
            </p>
          )}
          {!note.trim() && !saved && (
            <p className="at-muted" style={{ marginTop: 8 }}>
              Pick what was done, or type it, before saving.
            </p>
          )}
        </>
      )}

      {lightbox.isOpen && lightboxSet.length > 0 && (
        <PhotoLightbox
          photos={lightboxSet}
          index={lightbox.index ?? 0}
          onClose={lightbox.close}
          onIndex={lightbox.setIndex}
        />
      )}
    </>
  );
}

/** One end of the job: a row of thumbnails and a camera button. */
function PhotoStrip({
  title,
  hint,
  shots,
  vehicleId,
  busy,
  onAdd,
  onOpen,
}: {
  title: string;
  hint: string;
  shots: Attachment[];
  vehicleId: string;
  busy: boolean;
  onAdd: () => void;
  onOpen: (i: number) => void;
}) {
  return (
    <>
      <div className="mw-sec">
        <Camera size={14} /> {title}
        {shots.length > 0 && <span className="n">{shots.length}</span>}
      </div>
      <div className="mw-strip">
        {shots.map((p, i) => (
          <button key={p.id} className="tds-thumb" onClick={() => onOpen(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/backend/vehicle-profile/${vehicleId}/photos/${p.id}/content`}
              alt={p.caption ?? title}
              loading="lazy"
            />
          </button>
        ))}
        <button className="mw-add" onClick={onAdd} disabled={busy}>
          {busy ? <span className="at-muted">…</span> : <Camera size={24} />}
          <span>{busy ? 'Uploading' : shots.length ? 'Add' : 'Take'}</span>
        </button>
      </div>
      {shots.length === 0 && !busy && <p className="at-muted mw-hint">{hint}</p>}
      {shots.length > 0 && (
        <p className="at-muted mw-hint">
          <Check size={13} /> Saved as you take them
        </p>
      )}
    </>
  );
}
