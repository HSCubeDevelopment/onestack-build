import { describe, expect, it } from 'vitest';
import {
  clearedLockState,
  hashPin,
  isLocked,
  isValidPin,
  MAX_ATTEMPTS,
  minutesUntilUnlock,
  PinLockState,
  registerFailure,
  verifyPin,
} from './pin';

describe('isValidPin', () => {
  it('accepts exactly four digits, rejects everything else', () => {
    expect(isValidPin('0000')).toBe(true);
    expect(isValidPin('4821')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('')).toBe(false);
  });
});

describe('hashPin / verifyPin', () => {
  it('round-trips the correct PIN and rejects the wrong one', () => {
    const stored = hashPin('4821');
    expect(verifyPin('4821', stored)).toBe(true);
    expect(verifyPin('4822', stored)).toBe(false);
    expect(verifyPin('0000', stored)).toBe(false);
  });

  it('never stores the PIN in the clear and salts each hash', () => {
    const a = hashPin('1234');
    const b = hashPin('1234');
    expect(a).not.toContain('1234');
    expect(a).not.toEqual(b); // different salt → different hash for the same PIN
    expect(a.startsWith('scrypt$')).toBe(true);
    // Both still verify against their own hash.
    expect(verifyPin('1234', a)).toBe(true);
    expect(verifyPin('1234', b)).toBe(true);
  });

  it('returns false for malformed or missing stored hashes rather than throwing', () => {
    expect(verifyPin('1234', null)).toBe(false);
    expect(verifyPin('1234', '')).toBe(false);
    expect(verifyPin('1234', 'not-a-hash')).toBe(false);
    expect(verifyPin('1234', 'scrypt$abc')).toBe(false);
    expect(verifyPin('1234', 'bcrypt$salt$hash')).toBe(false);
    expect(verifyPin('1234', 'scrypt$salt$zzzz')).toBe(false);
  });
});

describe('lockout', () => {
  const t0 = Date.parse('2026-07-27T09:00:00Z');

  it('locks after MAX_ATTEMPTS wrong tries and reports the remaining minutes', () => {
    let s: PinLockState = clearedLockState();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      s = registerFailure(s, t0);
      expect(isLocked(s, t0)).toBe(false); // still open before the last attempt
    }
    s = registerFailure(s, t0); // the MAX_ATTEMPTS-th failure
    expect(isLocked(s, t0)).toBe(true);
    expect(minutesUntilUnlock(s, t0)).toBe(15);
  });

  it('unlocks once the lock window passes, and the counter starts clean', () => {
    let s: PinLockState = clearedLockState();
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = registerFailure(s, t0);
    expect(isLocked(s, t0)).toBe(true);

    const later = t0 + 16 * 60 * 1000; // 16 minutes on
    expect(isLocked(s, later)).toBe(false);
    expect(minutesUntilUnlock(s, later)).toBe(0);
    expect(s.failedCount).toBe(0); // reset when it locked, so the next window is fresh
  });

  it('a cleared state (after success) is never locked', () => {
    const s = clearedLockState();
    expect(isLocked(s, t0)).toBe(false);
    expect(s.failedCount).toBe(0);
    expect(s.lockedUntil).toBeNull();
  });
});
