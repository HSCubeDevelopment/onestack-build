import { describe, expect, it } from 'vitest';
import { captionPhase, phaseCaption, resolveTargetJob, type JobLite } from './repair-photos';

const job = (id: string, daysAgo: number, isOpen: boolean): JobLite => ({
  id,
  reference: `JOB-${id}`,
  stateName: isOpen ? 'InProgress' : 'Collected',
  createdAt: new Date(2026, 0, 1 + (30 - daysAgo)),
  isOpen,
});

describe('phase ↔ caption', () => {
  it('round-trips the three phases', () => {
    expect(phaseCaption('before')).toBe('Before repair');
    expect(captionPhase('Before repair')).toBe('before');
    expect(captionPhase('During repair')).toBe('during');
    expect(captionPhase('After repair')).toBe('after');
  });

  it('non-phase captions and null map to null', () => {
    expect(captionPhase('Some other note')).toBeNull();
    expect(captionPhase(null)).toBeNull();
  });
});

describe('resolveTargetJob', () => {
  it('errors when the car has no jobs', () => {
    expect(resolveTargetJob([])).toEqual({ error: 'no_jobs' });
  });

  it('picks the most recent OPEN job by default', () => {
    const jobs = [job('a', 10, false), job('b', 5, true), job('c', 2, false)];
    const r = resolveTargetJob(jobs);
    expect('job' in r && r.job.id).toBe('b'); // open, even though c is more recent but closed
  });

  it('falls back to the most recent job when none are open', () => {
    const jobs = [job('a', 10, false), job('c', 2, false)];
    const r = resolveTargetJob(jobs);
    expect('job' in r && r.job.id).toBe('c');
  });

  it('honours an explicit jobId that belongs to the car', () => {
    const jobs = [job('a', 10, true), job('b', 5, true)];
    const r = resolveTargetJob(jobs, 'a');
    expect('job' in r && r.job.id).toBe('a');
  });

  it('rejects a jobId that is not one of the car’s jobs', () => {
    const jobs = [job('a', 10, true)];
    expect(resolveTargetJob(jobs, 'z')).toEqual({ error: 'job_not_on_vehicle' });
  });
});
