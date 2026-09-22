'use client';
import { api } from '@/lib/api';
import { FleetVehicle } from '@/lib/fleet';

/**
 * The vehicle list, fetched once per page load and shared by everything that needs to turn a rego into
 * a car.
 *
 * There is no lookup-many endpoint — `/fleet/vehicles/lookup` resolves one exact rego — so a screen
 * showing fifteen regos would otherwise make fifteen requests, or every screen would fetch the whole
 * list again. One module-level promise instead: the rego suggestions and the yard screens share it, so
 * a shop walking between them pays for it once.
 */
let cache: Promise<FleetVehicle[]> | null = null;

export function allVehicles(): Promise<FleetVehicle[]> {
  cache ??= api.get<FleetVehicle[]>('/fleet/vehicles').catch(() => {
    // Don't cache a failure — the next caller should get a real attempt, not a permanent empty list.
    cache = null;
    return [];
  });
  return cache;
}

/** Regos indexed for lookup. Normalised, because a tag's rego and ours differ in spacing and case. */
export async function vehiclesByRego(): Promise<Map<string, FleetVehicle>> {
  const list = await allVehicles();
  const map = new Map<string, FleetVehicle>();
  for (const v of list) map.set(normRego(v.rego), v);
  return map;
}

/** `1CW 8ZV` / `1cw-8zv` -> `1CW8ZV`. */
export const normRego = (rego: string): string => rego.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
