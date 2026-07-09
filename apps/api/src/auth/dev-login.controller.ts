import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import * as jwt from 'jsonwebtoken';
import { AppRole } from './auth.types';

/** DEV-ONLY: optionally override which seeded identity to mint a token for. */
export class DevLoginDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(['OWNER', 'STAFF'])
  role?: AppRole;
}

/**
 * DEV-ONLY login. Real login is Supabase Auth (managed) — NOT hand-rolled here. This endpoint exists so
 * clients WITHOUT a server-side proxy (the mobile app) can obtain a token during local/staging development,
 * mirroring what the web skeleton does server-side (`mintDevToken`). It is HARD-GATED: it only works when
 * `DEV_LOGIN_ENABLED === 'true'` AND `NODE_ENV !== 'production'`, and returns 403 otherwise. It mints the
 * exact claim shape the JwtAuthGuard expects ({ sub, tenant_id, role }) for the seeded demo identity, signed
 * with SUPABASE_JWT_SECRET. It must stay disabled in production — see the PR notes. It does not touch the
 * guard, RLS, or any tenant data.
 */
@Controller('auth')
export class DevLoginController {
  @Post('dev-login')
  devLogin(@Body() dto: DevLoginDto): {
    token: string;
    user: { userId: string; tenantId: string; role: AppRole };
    expiresInSeconds: number;
  } {
    if (process.env.DEV_LOGIN_ENABLED !== 'true' || process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev login is disabled');
    }
    const secret = process.env.SUPABASE_JWT_SECRET;
    const tenantId = dto.tenantId ?? process.env.DEMO_TENANT_ID;
    const userId = dto.userId ?? process.env.DEMO_OWNER_USER_ID;
    const role: AppRole = dto.role ?? 'OWNER';
    if (!secret || !tenantId || !userId) {
      throw new ForbiddenException(
        'Dev login is not configured (need SUPABASE_JWT_SECRET, DEMO_TENANT_ID, DEMO_OWNER_USER_ID)',
      );
    }
    const expiresInSeconds = 60 * 60 * 8; // 8h — a comfortable dev session
    const token = jwt.sign({ sub: userId, tenant_id: tenantId, role }, secret, {
      expiresIn: expiresInSeconds,
    });
    return { token, user: { userId, tenantId, role }, expiresInSeconds };
  }
}
