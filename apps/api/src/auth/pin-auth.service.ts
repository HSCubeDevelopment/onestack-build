import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { AppRole } from './auth.types';
import { EMPLOYEE_ROSTER } from './employee-roster';
import {
  clearedLockState,
  isLocked,
  isValidPin,
  LOCKOUT_MINUTES,
  minutesUntilUnlock,
  PinLockState,
  registerFailure,
  verifyPin,
} from './pin';
import { SupabaseAuthService } from './supabase-auth.service';

const SESSION_SECONDS = 60 * 60 * 8; // 8h, same as password login

export interface PinDirectoryEntry {
  userId: string;
  name: string;
  role: AppRole;
  site: string | null;
}

export interface PinLoginResult {
  token: string;
  user: { userId: string; tenantId: string; role: AppRole };
  expiresInSeconds: number;
}

/** app_metadata keys we own for PIN auth. Server-only — never included in the JWT we mint. */
const PIN_HASH = 'pin_hash';
const PIN_FAILED = 'pin_failed_count';
const PIN_LOCKED = 'pin_locked_until';

/**
 * PIN sign-in for the shop floor. Verifies a 4-digit PIN against the salted hash in Supabase app_metadata,
 * enforces a per-person lockout, and on success mints the SAME `{sub, tenant_id, role}` JWT the password
 * login issues — so everything downstream (guards, tenant scoping, attribution) is identical. The hash and
 * lockout live in server-only app_metadata and are never returned to a client.
 *
 * ⚠️ AUTH — hand-rolled by necessity (Supabase Auth has no 4-digit-PIN grant). Weak-credential mitigations
 * (hash-at-rest, never-expose, lockout) live in `pin.ts`. Flagged for human review; not to be self-merged.
 */
@Injectable()
export class PinAuthService {
  constructor(
    private readonly supabase: SupabaseAuthService,
    private readonly prisma: PrismaService,
  ) {}

  private demoTenantId(): string {
    const t = process.env.DEMO_TENANT_ID;
    if (!t) throw new ServiceUnavailableException('PIN login is not configured');
    return t;
  }

  /**
   * The people who can sign in, for the name-picker: owner, tow, and every employee, with their site.
   * No PINs, no emails-as-secrets — names and roles only (same public surface as the demo directory).
   */
  async directory(): Promise<PinDirectoryEntry[]> {
    const tenantId = this.demoTenantId();
    const members = await this.prisma.membership.findMany({
      where: { tenantId },
      select: { userId: true, role: true },
    });
    const profiles = await this.supabase.profilesByUserId(members.map((m) => m.userId));
    const siteByEmail = new Map(EMPLOYEE_ROSTER.map((e) => [e.email.toLowerCase(), e.site]));

    const entries = members
      // Only people who actually resolve to a Supabase identity can sign in — skip stale/placeholder
      // memberships with no user, so the picker never shows an "Unknown" row that can't log in.
      .filter((m) => profiles.has(m.userId))
      .map((m) => {
        const p = profiles.get(m.userId);
        const email = p?.email ?? null;
        return {
          userId: m.userId,
          name: p?.name || email || 'Unknown',
          role: m.role as AppRole,
          site: (email && siteByEmail.get(email.toLowerCase())) || null,
        };
      });
    // Owner first, then tow, then employees A–Z — the order the picker shows.
    const rank = (r: AppRole) => (r === 'OWNER' ? 0 : r === 'TOW' ? 1 : 2);
    return entries.sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));
  }

  /** Verify a PIN for one person and, on success, mint their session token. */
  async pinLogin(userId: string, pin: string): Promise<PinLoginResult> {
    if (!isValidPin(pin)) throw new UnauthorizedException('Enter your 4-digit PIN.');

    const user = await this.supabase.getUser(userId);
    if (!user) throw new UnauthorizedException('Unknown login.');
    const meta = { ...(user.app_metadata ?? {}) };

    const now = Date.now();
    const lock: PinLockState = {
      failedCount: Number(meta[PIN_FAILED]) || 0,
      lockedUntil: (meta[PIN_LOCKED] as string) || null,
    };
    if (isLocked(lock, now)) {
      throw new UnauthorizedException(
        `Too many wrong tries — try again in ${minutesUntilUnlock(lock, now)} minute(s).`,
      );
    }

    if (!verifyPin(pin, meta[PIN_HASH] as string | undefined)) {
      const next = registerFailure(lock, now);
      await this.persistLock(userId, meta, next);
      if (isLocked(next, now)) {
        throw new UnauthorizedException(
          `Too many wrong tries — locked for ${LOCKOUT_MINUTES} minutes.`,
        );
      }
      throw new UnauthorizedException('Incorrect PIN.');
    }

    // Success — clear any failure state.
    await this.persistLock(userId, meta, clearedLockState());

    // Resolve tenant + role, then mint the same claim shape the password login uses.
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { tenantId: true, role: true },
    });
    if (!membership) throw new ForbiddenException('This account is not linked to any workshop.');

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) throw new ForbiddenException('Auth is not configured.');
    const role = membership.role as AppRole;
    const token = jwt.sign({ sub: userId, tenant_id: membership.tenantId, role }, secret, {
      expiresIn: SESSION_SECONDS,
    });
    return {
      token,
      user: { userId, tenantId: membership.tenantId, role },
      expiresInSeconds: SESSION_SECONDS,
    };
  }

  /** Write the lockout counters back into app_metadata without disturbing the hash or other keys. */
  private async persistLock(
    userId: string,
    currentMeta: Record<string, unknown>,
    state: PinLockState,
  ): Promise<void> {
    await this.supabase.putAppMetadata(userId, {
      ...currentMeta,
      [PIN_FAILED]: state.failedCount,
      [PIN_LOCKED]: state.lockedUntil,
    });
  }
}
