/**
 * Repair-phase photos on a car (Before / During / After). Pure helpers, no DB/Nest — the target-job
 * resolution and the phase↔caption mapping, so they're unit-testable in isolation.
 *
 * Work-item attachments have no typed "phase" column, only a free-text `caption`. We encode the phase in
 * the caption with these canonical labels, and group by them on the way back out. If a typed phase is
 * ever wanted, this is the one place the convention lives.
 */
export const REPAIR_PHASES = ['before', 'during', 'after'] as const;
export type RepairPhase = (typeof REPAIR_PHASES)[number];

const CAPTION: Record<RepairPhase, string> = {
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
