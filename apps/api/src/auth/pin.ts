/**
 * PIN credential primitives for shop-floor sign-in. Pure; no DB, no Nest, no network.
 *
 * ⚠️ A 4-digit PIN is a WEAK credential by design (10,000 combinations) — chosen for shop-floor speed, not
 * strength. Two things make it acceptable, and both live here or in the caller:
 *   1. The PIN is stored only as a salted scrypt hash, never in the clear, and the hash lives in
 *      server-only Supabase app_metadata that is never returned to a client.
 *   2. A per-person lockout (see LOCKOUT_*) caps online guessing: after MAX_ATTEMPTS wrong tries the
 *      account is locked for LOCKOUT_MINUTES, so the 10,000-space can't be walked in bulk.
 * The hash does NOT defend a determined attacker who already has it (10k is trivially brute-forced
 * offline) — the lockout and the never-expose rule are the real defence. Keep both.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Wrong attempts before an account is locked. */
export const MAX_ATTEMPTS = 5;
/** How long an account stays locked once tripped. */
export const LOCKOUT_MINUTES = 15;
const LOCKOUT_MS = LOCKOUT_MINUTES * 60 * 1000;

const KEYLEN = 32;
const SCHEME = 'scrypt';

/** A 4-digit numeric PIN, "0000".."9999". */
export function isValidPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

/** Hash a PIN as `scrypt$<saltHex>$<hashHex>`. New random salt each call. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, KEYLEN).toString('hex');
  return `${SCHEME}$${salt}$${hash}`;
}

/** Constant-time verify of a PIN against a stored `scrypt$salt$hash`. False on any malformed input. */
export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== SCHEME) return false;
  const [, salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;
  const actual = scryptSync(pin, salt, KEYLEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Lockout state as it travels in app_metadata: a failure counter and an optional ISO lock expiry. */
export interface PinLockState {
  failedCount: number;
  lockedUntil: string | null;
}

/** True if the account is currently locked (lockedUntil is in the future relative to `nowMs`). */
export function isLocked(state: PinLockState, nowMs: number): boolean {
  if (!state.lockedUntil) return false;
  const t = Date.parse(state.lockedUntil);
  return Number.isFinite(t) && t > nowMs;
}

/** Whole minutes until an account unlocks (0 if not locked). For the "try again in N min" message. */
export function minutesUntilUnlock(state: PinLockState, nowMs: number): number {
  if (!state.lockedUntil) return 0;
  const t = Date.parse(state.lockedUntil);
  if (!Number.isFinite(t) || t <= nowMs) return 0;
  return Math.ceil((t - nowMs) / 60000);
}

/**
 * Apply one wrong attempt. On the MAX_ATTEMPTS-th failure the account locks for LOCKOUT_MINUTES and the
 * counter resets (so the next window starts clean once the lock expires).
 */
export function registerFailure(state: PinLockState, nowMs: number): PinLockState {
  const failedCount = state.failedCount + 1;
  if (failedCount >= MAX_ATTEMPTS) {
    return { failedCount: 0, lockedUntil: new Date(nowMs + LOCKOUT_MS).toISOString() };
  }
  return { failedCount, lockedUntil: null };
}

/** A clean slate — used after a successful sign-in. */
export function clearedLockState(): PinLockState {
  return { failedCount: 0, lockedUntil: null };
}
