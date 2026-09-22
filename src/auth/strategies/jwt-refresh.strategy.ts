import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type {
  RefreshJwtPayload,
  RefreshTokenContext,
} from '../types/jwt-payload.js';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshJwtPayload): RefreshTokenContext {
    const header = req.get('authorization') ?? '';
    const refreshToken = header.replace(/^Bearer\s+/i, '').trim();
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }
    return {
      id: payload.sub,
      email: payload.email,
      jti: payload.jti,
      refreshToken,
    };
  }
}
