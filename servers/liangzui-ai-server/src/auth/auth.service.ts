import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  AuthSessionListResponseSchema,
  AuthSessionResponseSchema,
  AuthUserSchema,
  MeResponseSchema,
  RevokeSessionResponseSchema,
  PERMISSIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  RoleKeySchema,
  type AuthSessionListResponse,
  type AuthSessionResponse,
  type AuthUser,
  type RevokeSessionResponse,
  type CodeLoginRequest,
  type MeResponse,
  type PasswordLoginRequest,
  type Permission,
  type RegisterRequest,
  type ResetPasswordRequest,
  type RoleKey,
  type SendCodeRequest,
  type SendCodeResponse,
} from '@ai-engine/contracts';
import { AUTH_CONFIG, type AuthRuntimeConfig } from './auth.config';
import {
  LOGIN_LOCK_LIMIT,
  LOGIN_LOCK_WINDOW_MS,
  SESSION_TOUCH_MS,
  USER_AGENT_MAX,
} from './auth.constants';
import { isUniqueViolation, throwAuthError, throwAuthUnavailable } from './auth.errors';
import type { AuthRequestMeta } from './auth-http';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type AuthSessionRecord,
  type AuthUserRecord,
} from './auth.repository';
import { hashIdentifier } from './identifier-hash';
import { maskIdentifier } from './mask-identifier';
import { PasswordHasher } from './password-hasher';
import { SessionTokenService } from './session-token';
import { type AuthLogger, VerificationService } from './verification.service';

export type AuthPrincipal = {
  userId: string;
  kind: 'guest' | 'registered';
  roles: RoleKey[];
  permissions: Permission[];
  sessionId: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const permissionsFor = (roleKeys: readonly RoleKey[]): Permission[] => {
  const granted = new Set<Permission>();
  for (const role of roleKeys) {
    for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  }
  return PERMISSIONS.filter((permission) => granted.has(permission));
};

const sortRoles = (keys: readonly string[]): RoleKey[] => {
  const parsed = keys.flatMap((key) => {
    const result = RoleKeySchema.safeParse(key);
    return result.success ? [result.data] : [];
  });
  return ROLE_KEYS.filter((key) => parsed.includes(key));
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repo: AuthRepository | null,
    private readonly passwords: PasswordHasher,
    private readonly tokens: SessionTokenService,
    private readonly verification: VerificationService,
    @Inject(AUTH_CONFIG) private readonly config: AuthRuntimeConfig,
    @Inject(PinoLogger) private readonly logger: AuthLogger,
  ) {}

  async issueGuest(meta: AuthRequestMeta): Promise<AuthSessionResponse> {
    const repo = this.requireRepo();
    if (meta.token) {
      const current = await this.readSession(meta.token, 'ignore');
      if (current) {
        return this.sessionResponse(repo, current.user, meta.token, current.session.expiresAt);
      }
    }
    return repo.transaction(async (tx) => {
      const user = await tx.insertUser({ kind: 'guest' });
      await tx.grantRole(user.id, 'guest');
      const session = await this.issueSession(tx, user.id, meta, this.config.guestTtlDays);
      this.log('info', '签发访客身份');
      return this.sessionResponse(tx, user, session.token, session.expiresAt);
    });
  }

  async sendCode(input: SendCodeRequest): Promise<SendCodeResponse> {
    this.requireRepo();
    return this.verification.send(input);
  }

  async register(input: RegisterRequest, meta: AuthRequestMeta): Promise<AuthSessionResponse> {
    const repo = this.requireRepo();
    await this.verification.consume(input, 'register');
    const taken = await repo.findIdentity(input.type, input.identifier);
    if (taken) {
      throwAuthError(HttpStatus.CONFLICT, 'IDENTIFIER_TAKEN', '该邮箱或手机号已注册');
    }
    const passwordHash = await this.passwords.hash(input.password);
    const guest = meta.token ? await this.readSession(meta.token, 'ignore') : null;
    if (guest && guest.user.kind !== 'guest') {
      throwAuthError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', '当前账号已注册');
    }

    return repo.transaction(async (tx) => {
      await tx.lockFirstAdmin();
      const stillTaken = await tx.findIdentity(input.type, input.identifier);
      if (stillTaken) {
        throwAuthError(HttpStatus.CONFLICT, 'IDENTIFIER_TAKEN', '该邮箱或手机号已注册');
      }

      let user: AuthUserRecord;
      if (guest) {
        const current = await tx.findUserById(guest.user.id);
        if (!current || current.kind !== 'guest') {
          throwAuthError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', '访客身份已注册');
        }
        user = await tx.updateUser(current.id, {
          kind: 'registered',
          displayName: input.displayName ?? current.displayName,
          passwordHash,
          updatedAt: new Date(),
        });
        await tx.revokeRole(current.id, 'guest');
        await tx.revokeSession(guest.session.id);
      } else {
        user = await tx.insertUser({
          kind: 'registered',
          displayName: input.displayName ?? null,
          passwordHash,
        });
      }

      try {
        await tx.insertIdentity({
          userId: user.id,
          type: input.type,
          identifier: input.identifier,
          verifiedAt: new Date(),
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throwAuthError(HttpStatus.CONFLICT, 'IDENTIFIER_TAKEN', '该邮箱或手机号已注册');
        }
        throw error;
      }

      if (!(await tx.hasAdmin())) {
        await tx.grantRole(user.id, 'admin');
        await tx.claimUnownedResources(user.id);
      }
      await tx.grantRole(user.id, 'user');
      await tx.insertEvent({
        userId: user.id,
        type: 'register',
        identifierHash: hashIdentifier(input.identifier),
      });
      const session = await this.issueSession(tx, user.id, meta, this.config.sessionTtlDays);
      this.log('info', '注册成功', input.identifier);
      return this.sessionResponse(tx, user, session.token, session.expiresAt);
    });
  }

  async loginWithPassword(
    input: PasswordLoginRequest,
    meta: AuthRequestMeta,
  ): Promise<AuthSessionResponse> {
    const repo = this.requireRepo();
    const identifierHash = hashIdentifier(input.identifier);
    const failures = await repo.countEventsSince(
      'login_failed',
      identifierHash,
      new Date(Date.now() - LOGIN_LOCK_WINDOW_MS),
    );
    const identity = await repo.findIdentity(input.type, input.identifier);
    const user = identity ? await repo.findUserById(identity.userId) : null;
    let matched = false;
    if (user?.passwordHash)
      matched = await this.passwords.verify(input.password, user.passwordHash);
    else await this.passwords.dummyVerify(input.password);

    if (failures >= LOGIN_LOCK_LIMIT) {
      throwAuthError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        '尝试次数过多，请 15 分钟后再试',
      );
    }
    if (!matched || !user || user.status !== 'active' || user.kind !== 'registered') {
      await repo.insertEvent({
        userId: user?.id ?? null,
        type: 'login_failed',
        identifierHash,
      });
      this.log('info', '登录失败', input.identifier);
      throwAuthError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', '账号或密码错误');
    }
    return this.openLoginSession(user, input.identifier, meta);
  }

  async loginWithCode(
    input: CodeLoginRequest,
    meta: AuthRequestMeta,
  ): Promise<AuthSessionResponse> {
    const repo = this.requireRepo();
    await this.verification.consume(input, 'login');
    const identity = await repo.findIdentity(input.type, input.identifier);
    if (!identity) {
      throwAuthError(HttpStatus.BAD_REQUEST, 'VERIFICATION_CODE_INVALID', '验证码无效或已过期');
    }
    const user = await repo.findUserById(identity.userId);
    if (!user || user.status !== 'active' || user.kind !== 'registered') {
      throwAuthError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', '账号或密码错误');
    }
    return this.openLoginSession(user, input.identifier, meta);
  }

  async resetPassword(input: ResetPasswordRequest): Promise<void> {
    const repo = this.requireRepo();
    await this.verification.consume(input, 'reset_password');
    const identity = await repo.findIdentity(input.type, input.identifier);
    if (!identity) {
      throwAuthError(HttpStatus.BAD_REQUEST, 'VERIFICATION_CODE_INVALID', '验证码无效或已过期');
    }
    const user = await repo.findUserById(identity.userId);
    if (!user || user.status !== 'active') {
      throwAuthError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', '账号或密码错误');
    }
    const passwordHash = await this.passwords.hash(input.password);
    await repo.updateUser(user.id, { passwordHash, updatedAt: new Date() });
    await repo.revokeSessionsForUser(user.id);
    await repo.insertEvent({
      userId: user.id,
      type: 'password_reset',
      identifierHash: hashIdentifier(input.identifier),
    });
    this.log('info', '密码已重置', input.identifier);
  }

  async logout(principal: AuthPrincipal): Promise<void> {
    const repo = this.requireRepo();
    await repo.revokeSession(principal.sessionId);
    await repo.insertEvent({ userId: principal.userId, type: 'logout' });
    this.log('info', '退出登录');
  }

  async listSessions(principal: AuthPrincipal): Promise<AuthSessionListResponse> {
    const rows = await this.requireRepo().listActiveSessions(principal.userId, new Date());
    return AuthSessionListResponseSchema.parse({
      sessions: rows.map((row) => ({
        id: row.id,
        client: row.client,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        current: row.id === principal.sessionId,
      })),
    });
  }

  async revokeDevice(principal: AuthPrincipal, sessionId: string): Promise<RevokeSessionResponse> {
    const repo = this.requireRepo();
    const current = sessionId === principal.sessionId;
    if (!(await repo.revokeOwnedSession(principal.userId, sessionId))) {
      throwAuthError(HttpStatus.NOT_FOUND, 'NOT_FOUND', '登录设备不存在');
    }
    await repo.insertEvent({ userId: principal.userId, type: 'logout' });
    this.log('info', '注销登录设备');
    return RevokeSessionResponseSchema.parse({ current });
  }

  /** 每天跑一次：先清过期会话，再删掉长期未活动的访客。 */
  async cleanupExpired(): Promise<{ expiredSessions: number; staleGuests: number }> {
    const repo = this.repo;
    if (!repo) return { expiredSessions: 0, staleGuests: 0 };
    const now = new Date();
    const lastSeenBefore = new Date(now.getTime() - this.config.guestTtlDays * DAY_MS);
    const expiredSessions = await repo.deleteExpiredSessions(now);
    const staleGuests = await repo.deleteStaleGuests(lastSeenBefore);
    this.log('info', '清理过期会话与访客');
    return { expiredSessions, staleGuests };
  }

  async me(principal: AuthPrincipal): Promise<MeResponse> {
    const repo = this.requireRepo();
    const user = await repo.findUserById(principal.userId);
    if (!user || user.status !== 'active') {
      throwAuthError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', '登录凭证无效');
    }
    const identities = await repo.listIdentities(user.id);
    return MeResponseSchema.parse({
      user: await this.toAuthUser(repo, user),
      identities: identities.map((row) => {
        const type = row.type === 'phone' ? 'phone' : 'email';
        return {
          type,
          identifier: maskIdentifier(type, row.identifier),
          verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
        };
      }),
    });
  }

  async authenticate(token: string): Promise<AuthPrincipal> {
    const repo = this.requireRepo();
    const current = await this.readSession(token, 'throw');
    if (!current) throwAuthError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', '登录凭证无效');
    return this.toPrincipal(repo, current.user, current.session.id);
  }

  private async openLoginSession(
    user: AuthUserRecord,
    identifier: string,
    meta: AuthRequestMeta,
  ): Promise<AuthSessionResponse> {
    const repo = this.requireRepo();
    const updated = await repo.updateUser(user.id, {
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.insertEvent({
      userId: user.id,
      type: 'login_success',
      identifierHash: hashIdentifier(identifier),
    });
    const session = await this.issueSession(repo, user.id, meta, this.config.sessionTtlDays);
    this.log('info', '登录成功', identifier);
    return this.sessionResponse(repo, updated, session.token, session.expiresAt);
  }

  private async readSession(
    token: string,
    missing: 'throw' | 'ignore',
  ): Promise<{ user: AuthUserRecord; session: AuthSessionRecord } | null> {
    const repo = this.requireRepo();
    const session = await repo.findSessionByTokenHash(this.tokens.hash(token));
    const invalid =
      !session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now();
    if (invalid || !session) {
      if (missing === 'throw')
        throwAuthError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', '登录凭证无效');
      return null;
    }
    const user = await repo.findUserById(session.userId);
    if (!user) {
      if (missing === 'throw')
        throwAuthError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', '登录凭证无效');
      return null;
    }
    if (user.status !== 'active') {
      throwAuthError(HttpStatus.FORBIDDEN, 'FORBIDDEN', '账号已停用');
    }
    const touched = await this.touchIfStale(repo, user, session);
    return { user, session: touched };
  }

  private async touchIfStale(
    repo: AuthRepository,
    user: AuthUserRecord,
    session: AuthSessionRecord,
  ): Promise<AuthSessionRecord> {
    if (Date.now() - session.lastSeenAt.getTime() < SESSION_TOUCH_MS) return session;
    const expiresAt =
      user.kind === 'registered'
        ? new Date(Date.now() + this.config.sessionTtlDays * DAY_MS)
        : session.expiresAt;
    return repo.touchSession(session.id, { lastSeenAt: new Date(), expiresAt });
  }

  private async issueSession(
    repo: AuthRepository,
    userId: string,
    meta: AuthRequestMeta,
    ttlDays: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const issued = this.tokens.issue();
    const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
    await repo.insertSession({
      userId,
      tokenHash: issued.tokenHash,
      client: meta.client === 'desktop' ? 'desktop' : 'web',
      userAgent: meta.userAgent ? meta.userAgent.slice(0, USER_AGENT_MAX) : null,
      expiresAt,
    });
    return { token: issued.token, expiresAt };
  }

  private async sessionResponse(
    repo: AuthRepository,
    user: AuthUserRecord,
    token: string,
    expiresAt: Date,
  ): Promise<AuthSessionResponse> {
    return AuthSessionResponseSchema.parse({
      token,
      expiresAt: expiresAt.toISOString(),
      user: await this.toAuthUser(repo, user),
    });
  }

  private async toAuthUser(repo: AuthRepository, user: AuthUserRecord): Promise<AuthUser> {
    const roles = sortRoles(await repo.listRoleKeys(user.id));
    return AuthUserSchema.parse({
      id: user.id,
      kind: user.kind,
      displayName: user.displayName,
      roles,
      permissions: permissionsFor(roles),
    });
  }

  private async toPrincipal(
    repo: AuthRepository,
    user: AuthUserRecord,
    sessionId: string,
  ): Promise<AuthPrincipal> {
    const authUser = await this.toAuthUser(repo, user);
    return {
      userId: user.id,
      kind: authUser.kind,
      roles: authUser.roles,
      permissions: authUser.permissions,
      sessionId,
    };
  }

  private requireRepo(): AuthRepository {
    const repo = this.repo;
    if (!repo) throwAuthUnavailable();
    return repo;
  }

  private log(level: 'info' | 'warn', message: string, identifier?: string): void {
    const fields: Record<string, unknown> = {};
    if (identifier) {
      fields.identifierLength = identifier.length;
      fields.identifierHash = hashIdentifier(identifier).slice(0, 12);
    }
    this.logger[level](fields, message);
  }
}
