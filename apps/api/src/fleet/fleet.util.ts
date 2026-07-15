/**
 * Pure helpers for the Fleet & courtesy-cars domain (migrated 1:1 from the "In N Out" staff app).
 * No DB / NestJS deps — unit-tested directly. Rego/phone normalisation matches the legacy app exactly so
 * search and de-duplication behave identically.
 */

export type FleetVehicleStatus = 'available' | 'out' | 'booked' | 'repair' | 'unknown';
export type FleetMovementStatus = 'active' | 'returned' | 'closed';
export type FleetBookingStatus = 'booked' | 'active' | 'completed' | 'cancelled';
export type FleetPhotoType =
  | 'before_handover'
  | 'after_return'
  | 'damage'
  | 'odometer'
  | 'fuel'
  | 'tow_card'
  | 'other';

export const FLEET_VEHICLE_STATUSES: FleetVehicleStatus[] = [
  'available',
  'out',
  'booked',
  'repair',
  'unknown',
];
export const FLEET_MOVEMENT_STATUSES: FleetMovementStatus[] = ['active', 'returned', 'closed'];
export const FLEET_BOOKING_STATUSES: FleetBookingStatus[] = [
  'booked',
  'active',
  'completed',
  'cancelled',
];
export const FLEET_PHOTO_TYPES: FleetPhotoType[] = [
  'before_handover',
  'after_return',
  'damage',
  'odometer',
  'fuel',
  'tow_card',
  'other',
];

/** "1pi3xz " -> "1PI3XZ". Uppercase, strip everything that isn't A-Z/0-9. */
export const normRego = (s: string | null | undefined): string =>
  (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Australian phone normalisation: keep digits; +61 → 0…; a bare 9-digit mobile starting 4 → 0…. */
export const normPhone = (s: string | null | undefined): string => {
  let d = (s ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('61')) d = '0' + d.slice(2);
  if (d.length === 9 && d.startsWith('4')) d = '0' + d;
  return d;
};

export const isFleetVehicleStatus = (v: string): v is FleetVehicleStatus =>
  (FLEET_VEHICLE_STATUSES as string[]).includes(v);

/** UTC instant for the start / end of "today" in server time — used by the dashboard's today counters. */
export const startOfToday = (now = new Date()): Date => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};
export const endOfToday = (now = new Date()): Date => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
};
