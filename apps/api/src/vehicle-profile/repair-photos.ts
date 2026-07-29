/**
 * Photo categories on a car. Pure helpers, no DB/Nest — the target-job resolution and the
 * category↔caption mapping, so they're unit-testable in isolation.
 *
 * Work-item attachments have no typed "category" column, only a free-text `caption`. We encode the
 * category in the caption with these canonical labels, and group by them on the way back out. If a typed
 * column is ever wanted, this is the one place the convention lives.
 *
 * The capture set mirrors the categories the floor actually shoots against — a car is photographed at
 * check-in, when damage is found (pre-existing vs. accident vs. supplementary), while work progresses,
 * and at handover. `uncategorized` is the honest bucket for a photo taken before anyone decides.
 */
export const PHOTO_CATEGORIES = [
  'uncategorized',
  'check_in',
  'existing_damage',
  'accident_damage',
  'supplementary_damage',
  'progress',
  'handover',
] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

/**
 * The original Before/During/After ids. Kept ACCEPTED and READABLE — never remapped — so photos taken
 * under the old flow keep their true label instead of being retro-labelled as something they weren't.
 * Not offered for new capture; the UI shows only PHOTO_CATEGORIES.
 */
export const LEGACY_PHASES = ['before', 'during', 'after'] as const;
export type LegacyPhase = (typeof LEGACY_PHASES)[number];

/** Everything the API accepts / can read back. */
export const REPAIR_PHASES = [...PHOTO_CATEGORIES, ...LEGACY_PHASES] as const;
export type RepairPhase = PhotoCategory | LegacyPhase;

const CAPTION: Record<RepairPhase, string> = {
  uncategorized: 'Uncategorized',
  check_in: 'Check In',
  existing_damage: 'Existing damage',
  accident_damage: 'Accident damage',
  supplementary_damage: 'Supplementary damage',
  progress: 'Progress',
  handover: 'Handover',
  before: 'Before repair',
  during: 'During repair',
  after: 'After repair',
};

/** The canonical caption stored for a phase. */
export function phaseCaption(phase: RepairPhase): string {
  return CAPTION[phase];
}

/** Reverse: which phase (if any) a caption represents. Non-phase captions → null. */
export function captionPhase(caption: string | null): RepairPhase | null {
  if (!caption) return null;
  return REPAIR_PHASES.find((p) => CAPTION[p] === caption) ?? null;
}

/** The minimal shape of a job needed to pick which one a photo attaches to. */
export interface JobLite {
  id: string;
  reference: string;
  stateName: string;
  createdAt: Date;
  isOpen: boolean;
}

export type ResolveResult = { job: JobLite } | { error: 'no_jobs' | 'job_not_on_vehicle' };

/**
 * Decide which job a car's photo attaches to:
 *  - an explicit `jobId` must be one of the car's jobs (else `job_not_on_vehicle`);
 *  - otherwise the most-recent OPEN job (what "the current job" means on the floor);
 *  - otherwise the most-recent job of any state (so a just-closed car can still get an "after" photo);
 *  - `no_jobs` when the car has never had a job.
 */
export function resolveTargetJob(jobs: JobLite[], jobId?: string): ResolveResult {
  if (jobs.length === 0) return { error: 'no_jobs' };
  if (jobId) {
    const j = jobs.find((x) => x.id === jobId);
    return j ? { job: j } : { error: 'job_not_on_vehicle' };
  }
  const byRecent = [...jobs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const target = byRecent.find((j) => j.isOpen) ?? byRecent[0];
  if (!target) return { error: 'no_jobs' }; // unreachable (length checked above); satisfies the type
  return { job: target };
}
