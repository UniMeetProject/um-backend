import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const CONFIG: Record<string, string> = {
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
};

describe('AuthService', () => {
  let service: AuthService;
  let users: {
    findByEmail: ReturnType<typeof vi.fn>;
    findByUsername: ReturnType<typeof vi.fn>;
    findByIdentifier: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let prisma: { refreshToken: Record<string, ReturnType<typeof vi.fn>> };
  let jwt: { signAsync: ReturnType<typeof vi.fn>; decode: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    users = {
      findByEmail: vi.fn(),
      findByUsername: vi.fn(),
      findByIdentifier: vi.fn(),
      create: vi.fn(),
    };
    prisma = {
      refreshToken: {
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    const now = Math.floor(Date.now() / 1000);
    jwt = {
      signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
      decode: vi.fn().mockReturnValue({ exp: now + 900, iat: now }),
    };
    const config = { getOrThrow: (key: string) => CONFIG[key] };

    service = new AuthService(
      users as unknown as UsersService,
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('register', () => {
    it('rejects an already registered email', async () => {
      users.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.de' });

      await expect(
        service.register('a@b.de', 'password123', 'user1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('rejects an already registered username', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.findByUsername.mockResolvedValue({ id: 'u1', username: 'user1' });

      await expect(
        service.register('a@b.de', 'password123', 'user1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('hashes the password and issues tokens', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.findByUsername.mockResolvedValue(null);
      users.create.mockResolvedValue({ id: 'u1', email: 'a@b.de' });

      const tokens = await service.register('a@b.de', 'password123', 'user1');

      expect(tokens).toEqual({
        accessToken: 'signed.jwt.token',
        refreshToken: 'signed.jwt.token',
        tokenType: 'Bearer',
        expiresIn: 900,
      });
      const [, , passwordHash] = users.create.mock.calls[0];
      expect(passwordHash).not.toBe('password123');
      expect(await argon2.verify(passwordHash, 'password123')).toBe(true);
      expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
    });
  });

  describe('login', () => {
    it('throws Unauthorized for an unknown user', async () => {
      users.findByIdentifier.mockResolvedValue(null);

      await expect(service.login('x@y.de', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws Unauthorized for a wrong password', async () => {
      users.findByIdentifier.mockResolvedValue({
        id: 'u1',
        email: 'a@b.de',
        passwordHash: await argon2.hash('correct-password'),
      });

      await expect(service.login('a@b.de', 'wrong-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('logs in with email or username', async () => {
      users.findByIdentifier.mockResolvedValue({
        id: 'u1',
        email: 'a@b.de',
        passwordHash: await argon2.hash('correct-password'),
      });

      const tokens = await service.login('user1', 'correct-password');

      expect(tokens.accessToken).toBe('signed.jwt.token');
      expect(users.findByIdentifier).toHaveBeenCalledWith('user1');
      expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
    });
  });

  describe('logout', () => {
    it('revokes all active refresh tokens for the user', async () => {
      await service.logout('u1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('refresh', () => {
    it('revokes everything and throws for an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refresh('u1', 'a@b.de', 'jti-1', 'some.token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledOnce();
    });
  });
});
