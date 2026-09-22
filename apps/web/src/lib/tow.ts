'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

/** One dispatched tow, exactly as GET /tow/mine returns it. */
export interface TowJob {
  jobId: string;
  reference: string;
  status: string;
  /** Where to collect it. A typed address, not a device fix. */
  pickupAddress: string | null;
  pickupNotes: string | null;
  dropOff: { yardId: string; name: string } | null;
  vehicle: { rego: string; make: string; model: string; year: number | null } | null;
  customer: { name: string; phone: string | null } | null;
  photos: { pickup: number; dropOff: number };
  assignedTo: string | null;
  updatedAt: string;
}

/**
 * How often the list refetches. There is no push of any kind in this app — the in-app notification
 * sender is a no-op — so polling is the only way a newly booked tow reaches a driver who already has
 * the screen open. A driver with the app closed learns about it when they next open it.
 */
const POLL_MS = 60_000;

/** A job the driver has finished is no longer work; it drops off their list. */
export const isOpenTow = (j: TowJob): boolean => j.status !== 'completed';

/**
 * The signed-in driver's tows, kept fresh.
 *
 * Shared between the home screen (which only wants the count) and the jobs screen (which renders
 * them), so the badge and the list can never disagree about how much work is outstanding.
 */
export function useMyTows(): {
  jobs: TowJob[] | null;
  open: TowJob[];
  error: string | null;
  reload: () => void;
} {
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

  return { jobs, open: (jobs ?? []).filter(isOpenTow), error, reload: () => void load() };
}
