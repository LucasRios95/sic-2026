import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IUserRoleRepository } from '@modules/AccessControl/repositories/IUserRoleRepository';
import { AuthenticateUserUseCase } from '@modules/Auth/useCases/AuthenticateUser/AuthenticateUserUseCase';
import { User } from '@modules/Users/infra/typeorm/entities/User';
import { IRefreshTokenRepository } from '@modules/Users/repositories/IRefreshTokenRepository';
import { IUserRepository } from '@modules/Users/repositories/IUserRepository';
import { IHashProvider } from '@shared/container/providers/HashProvider/IHashProvider';
import { ITokenProvider } from '@shared/container/providers/TokenProvider/ITokenProvider';
import { AccountLockedError, UnauthorizedError } from '@shared/errors';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'admin@example.com',
    passwordHash: 'hashed',
    fullName: 'Admin',
    active: true,
    mfaEnabled: false,
    failedLogins: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

interface Setup {
  useCase: AuthenticateUserUseCase;
  userRepo: IUserRepository;
  refreshRepo: IRefreshTokenRepository;
  userRoleRepo: IUserRoleRepository;
  hash: IHashProvider;
  token: ITokenProvider;
}

function setup(userOverrides: Partial<User> = {}): Setup {
  const user = buildUser(userOverrides);
  const userRepo: IUserRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(async () => user),
    save: vi.fn(async (u) => u),
  };
  const refreshRepo: IRefreshTokenRepository = {
    create: vi.fn(),
    findActiveByHash: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
  };
  const userRoleRepo: IUserRoleRepository = {
    assign: vi.fn(),
    loadContextForUser: vi.fn(async () => ({
      permissions: ['nfe.emit'],
      roles: ['Faturista'],
      accessibleCompanyIds: ['company-1'],
    })),
  };
  const hash: IHashProvider = {
    generateHash: vi.fn(),
    compareHash: vi.fn(async () => true),
  };
  const token: ITokenProvider = {
    signAccessToken: vi.fn(() => 'access-token'),
    verifyAccessToken: vi.fn(),
    generateRefreshTokenValue: vi.fn(() => 'refresh-token'),
    hashRefreshToken: vi.fn(() => 'hashed-refresh'),
    refreshTokenExpiresAt: vi.fn(() => new Date(Date.now() + 7 * 86_400_000)),
  };

  const useCase = new AuthenticateUserUseCase(userRepo, refreshRepo, userRoleRepo, hash, token);
  return { useCase, userRepo, refreshRepo, userRoleRepo, hash, token };
}

describe('AuthenticateUserUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('autentica usuário válido e emite access + refresh', async () => {
    const { useCase, refreshRepo } = setup();

    const result = await useCase.execute({ email: 'Admin@Example.com', password: 'Admin@123' });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user.email).toBe('admin@example.com');
    expect(refreshRepo.create).toHaveBeenCalledOnce();
  });

  it('mensagem genérica quando email não existe', async () => {
    const { useCase, userRepo } = setup();
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(
      useCase.execute({ email: 'foo@example.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('incrementa failedLogins em senha errada e bloqueia após 5 tentativas', async () => {
    const { useCase, userRepo, hash } = setup({ failedLogins: 4 });
    (hash.compareHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    await expect(
      useCase.execute({ email: 'admin@example.com', password: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    const saved = (userRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.failedLogins).toBe(5);
    expect(saved.lockedUntil).not.toBeNull();
  });

  it('retorna AccountLockedError quando lockedUntil é futuro', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    const { useCase } = setup({ lockedUntil: future });

    await expect(
      useCase.execute({ email: 'admin@example.com', password: 'Admin@123' }),
    ).rejects.toBeInstanceOf(AccountLockedError);
  });

  it('zera failedLogins em login bem-sucedido', async () => {
    const { useCase, userRepo } = setup({ failedLogins: 3 });

    await useCase.execute({ email: 'admin@example.com', password: 'Admin@123' });

    const saved = (userRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.failedLogins).toBe(0);
    expect(saved.lastLoginAt).toBeInstanceOf(Date);
  });

  it('recusa usuário inativo', async () => {
    const { useCase } = setup({ active: false });

    await expect(
      useCase.execute({ email: 'admin@example.com', password: 'Admin@123' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
