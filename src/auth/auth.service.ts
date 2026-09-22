import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import type { JwtPayload } from './types/jwt-payload.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string, username: string): Promise<AuthTokens> {
    const existingEmail = await this.users.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('Email already in use');
    }
    const existingUsername = await this.users.findByUsername(username);
    if (existingUsername) {
      throw new ConflictException('Username already in use');
    }
    const passwordHash = await argon2.hash(password);
    const user = await this.users.create(email, username, passwordHash);
    return this.issueTokens(user.id, user.email);
  }

  async login(identifier: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('Invalid Username or Password');
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid Username or Password');
    }
    return this.issueTokens(user.id, user.email);
  }

  async refresh(
    userId: string,
    email: string,
    jti: string,
    presentedToken: string,
  ): Promise<AuthTokens> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: jti },
    });

    const isValid =
      stored !== null &&
      stored.userId === userId &&
      stored.revokedAt === null &&
      stored.expiresAt > new Date() &&
      this.tokensMatch(stored.tokenHash, presentedToken);

    if (!isValid) {
      await this.logout(userId);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: jti },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(userId, email);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string, email: string): Promise<AuthTokens> {
    const accessPayload: JwtPayload = { sub: userId, email };
    const accessToken = await this.jwt.signAsync(
      accessPayload,
      this.signOptions('JWT_ACCESS_SECRET', 'JWT_ACCESS_EXPIRES_IN'),
    );

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { ...accessPayload, jti },
      this.signOptions('JWT_REFRESH_SECRET', 'JWT_REFRESH_EXPIRES_IN'),
    );

    await this.persistRefreshToken(jti, userId, refreshToken);

    const { exp, iat } = this.jwt.decode(accessToken) as {
      exp: number;
      iat: number;
    };
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: exp - iat,
    };
  }

  private signOptions(secretKey: string, expiresKey: string): JwtSignOptions {
    return {
      secret: this.config.getOrThrow<string>(secretKey),
      expiresIn: this.config.getOrThrow<string>(
        expiresKey,
      ) as JwtSignOptions['expiresIn'],
    };
  }

  private async persistRefreshToken(
    jti: string,
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokensMatch(storedHash: string, presentedToken: string): boolean {
    const presentedHash = this.hashToken(presentedToken);
    const a = Buffer.from(storedHash, 'hex');
    const b = Buffer.from(presentedHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
