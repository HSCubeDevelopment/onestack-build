/**
 * Pure helpers for the Fleet & courtesy-cars domain (migrated 1:1 from the "In N Out" staff app).
 * No DB / NestJS deps — unit-tested directly. Rego/phone normalisation matches the legacy app exactly so
 * search and de-duplication behave identically.
 */

export type FleetVehicleStatus = 'available' | 'out' | 'booked' | 'repair' | 'unknown';
export type FleetMovementStatus = 'active' | 'returned' | 'closed';
export type FleetBookingStatus = 'booked' | 'active' | 'completed' | 'cancelled';
export type FleetPhotoType =
  'before_handover' | 'after_return' | 'damage' | 'odometer' | 'fuel' | 'tow_card' | 'other';

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

/**
 * UTC instants bounding "today" in the SHOP's timezone (Melbourne) — used by the dashboard's today
 * counters and /fleet/today. The server runs in UTC, so a naive midnight would count a car returned
 * yesterday evening (Melbourne) as "today". We take the Melbourne calendar day of `now` and convert its
 * 00:00 → 23:59:59.999 back to the correct UTC instants (handles AEST/AEDT, incl. DST boundaries).
 */
export const SHOP_TZ = 'Australia/Melbourne';

/** Milliseconds that SHOP_TZ is ahead of UTC at the given instant. */
const tzOffsetMs = (at: Date): number => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, x) => {
      if (x.type !== 'literal') a[x.type] = x.value;
      return a;
    }, {});
  const n = (k: string): number => Number(p[k] ?? 0);
  const asIfUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asIfUtc - at.getTime();
};

export const startOfToday = (now = new Date()): Date => {
  const off = tzOffsetMs(now);
  const local = new Date(now.getTime() + off); // Melbourne wall-clock carried in the UTC fields
  const midnightWall = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  // Re-resolve the offset at that midnight in case `now` and midnight straddle a DST change.
  let inst = new Date(midnightWall - off);
  const off2 = tzOffsetMs(inst);
  if (off2 !== off) inst = new Date(midnightWall - off2);
  return inst;
};

export const endOfToday = (now = new Date()): Date =>
  new Date(startOfToday(now).getTime() + 24 * 3600 * 1000 - 1);
