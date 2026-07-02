import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './auth.types';

/** Injects the verified AuthContext into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.auth) {
      throw new UnauthorizedException();
    }
    return req.auth;
  },
);
