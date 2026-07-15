/**
 * Fleet & courtesy cars — client types + small label helpers (mirrors the API's view objects and the legacy
 * "In N Out" app's status vocabulary). Pages import `api` from '@/lib/api' and these types from here.
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

export const PURPOSE_OPTIONS = [
  { value: 'COURTESY', label: 'Courtesy' },
  { value: 'RENT', label: 'Rent' },
  { value: 'REPAIRS', label: 'Repairs' },
  { value: 'TOWED', label: 'Towed' },
  { value: 'SWAP', label: 'Swap' },
  { value: 'PICKUP', label: 'Pickup' },
  { value: 'OTHER', label: 'Other' },
];

export interface FleetVehicle {
  id: string;
  rego: string;
  regoRaw: string;
  make: string;
  model: string;
  vehicleType: string;
  status: FleetVehicleStatus;
  isCompanyCar: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FleetMovement {
  id: string;
  contactId: string | null;
  driverName: string;
  driverPhone: string;
  ownerName: string;
  ownerPhone: string;
  carsInRego: string;
  carsInRegoRaw: string;
  carsOutVehicleId: string | null;
  carsOutRego: string;
  carsOutRegoRaw: string;
  purpose: string;
  movedAt: string | null;
  status: FleetMovementStatus;
  needsReview: boolean;
  reviewReason: string;
  notes: string;
  staffName: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetReturn {
  id: string;
  movementId: string | null;
  contactId: string | null;
  returnedVehicleId: string | null;
  returnedRego: string;
  returnedRegoRaw: string;
  driverName: string;
  mobileNumber: string;
  returnedAt: string | null;
  bondStatus: string;
  notes: string;
  staffName: string;
  needsReview: boolean;
  reviewReason: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetBooking {
  id: string;
  vehicleId: string | null;
  vehicleRego: string;
  contactId: string | null;
  bookingName: string;
  bookingMobile: string;
  startAt: string;
  expectedReturnAt: string | null;
  purpose: string;
  status: FleetBookingStatus;
  notes: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetPhoto {
  id: string;
  vehicleId: string | null;
  movementId: string | null;
  returnId: string | null;
  bookingId: string | null;
  photoType: string;
  contentType: string;
  notes: string;
  uploadedByUserId: string | null;
  uploadedAt: string;
}

export interface FleetDashboardStats {
  carsOut: number;
  returnedToday: number;
  goingOutToday: number;
  availableCars: number;
  bookedCars: number;
  overdue: number;
  needsAttention: number;
}

export interface RentalPeriod {
  id: string;
  movementId: string | null;
  returnId: string | null;
  driverName: string;
  driverPhone: string;
  purpose: string;
  outAt: string | null;
  backAt: string | null;
  ongoing: boolean;
  notes: string;
  returnNotes: string;
}

export interface RegoConflict {
  vehicle: FleetVehicle | null;
  activeMovement: FleetMovement | null;
  bookings: FleetBooking[];
}

export interface FleetSearchResults {
  movements: FleetMovement[];
  returns: FleetReturn[];
  vehicles: FleetVehicle[];
  bookings: FleetBooking[];
}

// ---- label + badge-colour helpers (map to the web app's .badge colour classes) ----

export const vehicleStatusLabel: Record<FleetVehicleStatus, string> = {
  available: 'Available',
  out: 'Out',
  booked: 'Booked',
  repair: 'In repair',
  unknown: 'Needs review',
};
export const vehicleStatusColor: Record<FleetVehicleStatus, string> = {
  available: 'green',
  out: 'red',
  booked: 'amber',
  repair: 'purple',
  unknown: '',
};

export const movementStatusLabel: Record<FleetMovementStatus, string> = {
  active: 'Out now',
  returned: 'Returned',
  closed: 'Closed',
};

export const bookingStatusLabel: Record<FleetBookingStatus, string> = {
  booked: 'Booked',
  active: 'Picked up',
  completed: 'Returned',
  cancelled: 'Cancelled',
};
export const bookingStatusColor: Record<FleetBookingStatus, string> = {
  booked: 'amber',
  active: 'red',
  completed: 'green',
  cancelled: '',
};

export const purposeLabel = (p: string) => (p ? p.charAt(0) + p.slice(1).toLowerCase() : '—');

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Value for a <input type="datetime-local"> defaulting to now (local). */
export function nowLocalInputValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Convert a datetime-local value back to an ISO instant. */
export function localInputToISO(v: string): string {
  return v ? new Date(v).toISOString() : new Date().toISOString();
}
