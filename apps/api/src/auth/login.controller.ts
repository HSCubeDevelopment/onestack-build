import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { AppRole, AuthContext } from './auth.types';
import { AllowStaff } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { SupabaseAuthService } from './supabase-auth.service';

class SetFinanceAccessDto {
  @IsBoolean()
  canViewFinance!: boolean;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

interface LoginResult {
  token: string;
  user: { userId: string; tenantId: string; role: AppRole };
  expiresInSeconds: number;
}

const SESSION_SECONDS = 60 * 60 * 8; // 8h

/**
 * Real login backed by Supabase Auth, via a SERVER-SIDE proxy (card: time-clock/auth).
 *
 * Flow: verify email+password against Supabase Auth -> resolve the user's tenant + role from Membership
 * (privileged bootstrap read; no tenant context exists yet, same as the Supabase access-token hook would
 * do) -> mint the exact claim shape the JwtAuthGuard expects ({ sub, tenant_id, role }), signed with
 * SUPABASE_JWT_SECRET. The password is never seen or stored by us; Supabase verifies it.
 */
@Controller('auth')
export class LoginController {
  constructor(
    private readonly supabase: SupabaseAuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<LoginResult> {
    const verified = await this.supabase.verifyPassword(
      dto.email.trim().toLowerCase(),
      dto.password,
    );
    if (!verified) throw new UnauthorizedException('Invalid email or password');

    // Privileged read: at login there is no tenant context yet, so resolve membership on the admin
    // connection (like the access-token hook). First membership by creation is the active tenant.
    const membership = await this.prisma.membership.findFirst({
      where: { userId: verified.userId },
      orderBy: { createdAt: 'asc' },
      select: { tenantId: true, role: true },
    });
    if (!membership) {
      throw new ForbiddenException('This account is not linked to any workspace');
    }

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) throw new ForbiddenException('Auth is not configured');
    const role = membership.role as AppRole;
    const token = jwt.sign({ sub: verified.userId, tenant_id: membership.tenantId, role }, secret, {
      expiresIn: SESSION_SECONDS,
    });
    return {
      token,
      user: { userId: verified.userId, tenantId: membership.tenantId, role },
      expiresInSeconds: SESSION_SECONDS,
    };
  }

  /**
   * The seeded sample credentials, so the sign-in page can display / prefill them.
   *
   * By product decision this is available in EVERY environment (including production) — the demo tenant's
   * sample logins are shown on the public sign-in page. `DEV_LOGIN_ENABLED` is the single on/off switch;
   * set it to anything but 'true' to hide it. Note: this exposes the demo owner/staff passwords publicly.
   * That is intentional and contained — those accounts belong to the demo tenant only, and Postgres RLS
   * keeps them away from any other tenant's data.
   */
  @Get('demo-credentials')
  demoCredentials(): {
    accounts: { label: string; email: string; password: string; role: AppRole }[];
  } {
    if (process.env.DEV_LOGIN_ENABLED !== 'true') {
      throw new ForbiddenException('Demo credentials are not available');
    }
    const owner = process.env.DEMO_OWNER_EMAIL;
    const ownerPw = process.env.DEMO_OWNER_PASSWORD;
    const staff = process.env.DEMO_STAFF_EMAIL;
    const staffPw = process.env.DEMO_STAFF_PASSWORD;
    // A tow driver is a first-class TOW role (301) — staff-level API access with a tow-focused web nav.
    const tow = process.env.DEMO_TOW_EMAIL;
    const towPw = process.env.DEMO_TOW_PASSWORD;
    const accounts: { label: string; email: string; password: string; role: AppRole }[] = [];
    if (owner && ownerPw)
      accounts.push({ label: 'Owner', email: owner, password: ownerPw, role: 'OWNER' });
    if (staff && staffPw)
      accounts.push({ label: 'Staff', email: staff, password: staffPw, role: 'STAFF' });
    if (tow && towPw) accounts.push({ label: 'Tow', email: tow, password: towPw, role: 'TOW' });
    return { accounts };
  }

  /**
   * OWNER: users in this tenant with their email, role and finance access — so the team page can show
   * names (not ids) and manage who can see money (40.8).
   */
  @Get('directory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async directory(
    @CurrentUser() user: AuthContext,
  ): Promise<{ userId: string; email: string | null; role: AppRole; canViewFinance: boolean }[]> {
    const members = await this.prisma.membership.findMany({
      where: { tenantId: user.tenantId },
      select: { userId: true, role: true, canViewFinance: true },
    });
    const emails = await this.supabase.emailsByUserId(members.map((m) => m.userId));
    return members.map((m) => ({
      userId: m.userId,
      email: emails.get(m.userId) ?? null,
      role: m.role as AppRole,
      // An owner always has finance access; the flag is only meaningful for staff.
      canViewFinance: m.role === 'OWNER' ? true : m.canViewFinance,
    }));
  }

  /**
   * OWNER: grant or revoke a staff member's finance access (40.8). Scoped to this tenant's members; an
   * owner's access is intrinsic and not stored per-flag, so setting it on an owner is a no-op.
   */
  @Patch('members/:userId/finance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async setFinanceAccess(
    @CurrentUser() user: AuthContext,
    @Param('userId') userId: string,
    @Body() dto: SetFinanceAccessDto,
  ): Promise<{ userId: string; canViewFinance: boolean }> {
    const membership = await this.prisma.membership.findFirst({
      where: { tenantId: user.tenantId, userId },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException('Not a member of this workshop');
    if (membership.role !== 'OWNER') {
      await this.prisma.membership.updateMany({
        where: { tenantId: user.tenantId, userId },
        data: { canViewFinance: dto.canViewFinance },
      });
    }
    return { userId, canViewFinance: membership.role === 'OWNER' ? true : dto.canViewFinance };
  }

  /**
   * The CURRENT user's own permissions (40.8) — so the web can decide whether to show the money nav.
   * Staff-accessible: a member is always allowed to learn what they themselves can do.
   */
  @Get('permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AllowStaff()
  async permissions(@CurrentUser() user: AuthContext): Promise<{ canViewFinance: boolean }> {
    if (user.role === 'OWNER') return { canViewFinance: true };
    const membership = await this.prisma.membership.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { canViewFinance: true },
    });
    return { canViewFinance: membership?.canViewFinance ?? false };
  }
}
