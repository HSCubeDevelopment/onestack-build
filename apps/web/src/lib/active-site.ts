'use client';
import { useEffect, useState } from 'react';

/**
 * The "active workshop" the owner is looking at (SITE-1 / multi-workshop switcher, 52.2).
 *
 * A single client-side selection, mirrored to a cookie so it survives reloads. `'all'` means every
 * workshop. Pages (jobs, board, dashboard) read it to scope what they show; the Topbar switcher sets it.
 * A custom event keeps every mounted component in sync without a global store.
 */
const KEY = 'onestack_active_site';
const EVENT = 'onestack:active-site';
export const ALL_SITES = 'all';

export function getActiveSite(): string {
  if (typeof window === 'undefined') return ALL_SITES;
  return window.localStorage.getItem(KEY) || ALL_SITES;
}

export function setActiveSite(siteId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, siteId);
  // Cookie too, so a future server component could read the choice. Not sensitive (just a site id).
  document.cookie = `${KEY}=${encodeURIComponent(siteId)};path=/;max-age=31536000;samesite=lax`;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Subscribe to the active workshop. Returns [activeSiteId, setActiveSite]. */
export function useActiveSite(): readonly [string, (id: string) => void] {
  const [site, setSite] = useState<string>(ALL_SITES);
  useEffect(() => {
    setSite(getActiveSite());
    const handler = () => setSite(getActiveSite());
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return [site, setActiveSite] as const;
}
