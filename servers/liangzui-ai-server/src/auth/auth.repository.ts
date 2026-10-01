import { and, asc, count, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { AppDatabase } from '../database/pg-vector-store';
import {
  authEvents,
  authSessions,
  chatSessions,
  datasets,
  roles,
  userIdentities,
  userRoles,
  users,
  verificationCodes,
  workflows,
} from '../database/schema';
import { FIRST_ADMIN_LOCK_KEY } from './auth.constants';

export type AuthUserKind = 'guest' | 'registered';
export type AuthIdentityType = 'email' | 'phone';
export type AuthClient = 'web' | 'desktop';
export type AuthEventType =
  'code_sent' | 'register' | 'login_success' | 'login_failed' | 'logout' | 'password_reset';
export type VerificationPurpose = 'register' | 'login' | 'reset_password';

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export type AuthUserRecord = typeof users.$inferSelect;
export type AuthIdentityRecord = typeof userIdentities.$inferSelect;
export type VerificationCodeRecord = typeof verificationCodes.$inferSelect;
export type AuthSessionRecord = typeof authSessions.$inferSelect;

export type AuthUserPatch = Partial<
  Pick<
    AuthUserRecord,
    'kind' | 'displayName' | 'passwordHash' | 'status' | 'lastLoginAt' | 'updatedAt'
  >
>;

export interface AuthRepository {
  transaction<T>(run: (repo: AuthRepository) => Promise<T>): Promise<T>;
  lockFirstAdmin(): Promise<void>;
  insertUser(input: {
    kind: AuthUserKind;
    displayName?: string | null;
    passwordHash?: string | null;
    status?: 'active' | 'disabled';
  }): Promise<AuthUserRecord>;
  updateUser(id: string, patch: AuthUserPatch): Promise<AuthUserRecord>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  insertIdentity(input: {
    userId: string;
    type: AuthIdentityType;
    identifier: string;
    verifiedAt?: Date | null;
  }): Promise<AuthIdentityRecord>;
  findIdentity(type: AuthIdentityType, identifier: string): Promise<AuthIdentityRecord | null>;
  listIdentities(userId: string): Promise<AuthIdentityRecord[]>;
  grantRole(userId: string, roleKey: string): Promise<unknown>;
  revokeRole(userId: string, roleKey: string): Promise<void>;
  listRoleKeys(userId: string): Promise<string[]>;
  hasAdmin(): Promise<boolean>;
  insertVerificationCode(input: {
    type: AuthIdentityType;
    identifier: string;
    purpose: VerificationPurpose;
    codeHash: string;
    expiresAt: Date;
  }): Promise<VerificationCodeRecord>;
  findLatestCode(
    type: AuthIdentityType,
    identifier: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | null>;
  countCodesSince(type: AuthIdentityType, identifier: string, since: Date): Promise<number>;
  /** 原子自增；已消费或已达上限时返回 null，并发请求不能越过次数上限。 */
  incrementCodeAttempt(id: string, maxAttempts: number): Promise<VerificationCodeRecord | null>;
  /** 只有第一次消费返回 true。 */
  consumeCode(id: string): Promise<boolean>;
  insertSession(input: {
    userId: string;
    tokenHash: string;
    client: AuthClient;
    expiresAt: Date;
    userAgent?: string | null;
  }): Promise<AuthSessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  touchSession(
    id: string,
    input: { lastSeenAt: Date; expiresAt: Date },
  ): Promise<AuthSessionRecord>;
  revokeSession(id: string): Promise<void>;
  revokeSessionsForUser(userId: string): Promise<void>;
  insertEvent(input: {
    userId?: string | null;
    type: AuthEventType;
    identifierHash?: string | null;
  }): Promise<unknown>;
  countEventsSince(type: AuthEventType, identifierHash: string, since: Date): Promise<number>;
  claimUnownedResources(userId: string): Promise<void>;
}

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly db: AppDatabase) {}

  async insertUser(input: {
    kind: AuthUserKind;
    displayName?: string | null;
    passwordHash?: string | null;
    status?: 'active' | 'disabled';
  }) {
    const [row] = await this.db
      .insert(users)
      .values({
        kind: input.kind,
        displayName: input.displayName ?? null,
        passwordHash: input.passwordHash ?? null,
        status: input.status ?? 'active',
      })
      .returning();
    if (!row) throw new Error('写入用户失败');
    return row;
  }

  async insertIdentity(input: {
    userId: string;
    type: AuthIdentityType;
    identifier: string;
    verifiedAt?: Date | null;
  }) {
    const [row] = await this.db
      .insert(userIdentities)
      .values({
        userId: input.userId,
        type: input.type,
        identifier: input.identifier,
        verifiedAt: input.verifiedAt ?? null,
      })
      .returning();
    if (!row) throw new Error('写入登录标识失败');
    return row;
  }

  async listRoles() {
    return this.db.select().from(roles);
  }

  async grantRole(userId: string, roleKey: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.key, roleKey)).limit(1);
    if (!role) throw new Error(`角色不存在: ${roleKey}`);
    const [row] = await this.db.insert(userRoles).values({ userId, roleId: role.id }).returning();
    if (!row) throw new Error('授予角色失败');
    return row;
  }

  async insertVerificationCode(input: {
    type: AuthIdentityType;
    identifier: string;
    purpose: 'register' | 'login' | 'reset_password';
    codeHash: string;
    expiresAt: Date;
  }) {
    const [row] = await this.db.insert(verificationCodes).values(input).returning();
    if (!row) throw new Error('写入验证码失败');
    return row;
  }

  async insertSession(input: {
    userId: string;
    tokenHash: string;
    client: AuthClient;
    expiresAt: Date;
    userAgent?: string | null;
  }) {
    const [row] = await this.db
      .insert(authSessions)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        client: input.client,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
      })
      .returning();
    if (!row) throw new Error('写入会话失败');
    return row;
  }

  async insertEvent(input: {
    userId?: string | null;
    type: 'code_sent' | 'register' | 'login_success' | 'login_failed' | 'logout' | 'password_reset';
    identifierHash?: string | null;
  }) {
    const [row] = await this.db
      .insert(authEvents)
      .values({
        userId: input.userId ?? null,
        type: input.type,
        identifierHash: input.identifierHash ?? null,
      })
      .returning();
    if (!row) throw new Error('写入审计事件失败');
    return row;
  }

  async findEvent(id: string) {
    const [row] = await this.db.select().from(authEvents).where(eq(authEvents.id, id)).limit(1);
    return row ?? null;
  }

  async deleteUser(id: string) {
    await this.db.delete(users).where(eq(users.id, id));
  }

  async transaction<T>(run: (repo: AuthRepository) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => run(new DrizzleAuthRepository(tx)));
  }

  async lockFirstAdmin(): Promise<void> {
    await this.db.execute(sql`select pg_advisory_xact_lock(${FIRST_ADMIN_LOCK_KEY}::bigint)`);
  }

  async updateUser(id: string, patch: AuthUserPatch): Promise<AuthUserRecord> {
    const [row] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
    if (!row) throw new Error('更新用户失败');
    return row;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async findIdentity(
    type: AuthIdentityType,
    identifier: string,
  ): Promise<AuthIdentityRecord | null> {
    const [row] = await this.db
      .select()
      .from(userIdentities)
      .where(and(eq(userIdentities.type, type), eq(userIdentities.identifier, identifier)))
      .limit(1);
    return row ?? null;
  }

  async listIdentities(userId: string): Promise<AuthIdentityRecord[]> {
    return this.db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId))
      .orderBy(asc(userIdentities.createdAt));
  }

  async revokeRole(userId: string, roleKey: string): Promise<void> {
    const [role] = await this.db.select().from(roles).where(eq(roles.key, roleKey)).limit(1);
    if (!role) return;
    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
  }

  async listRoleKeys(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    return rows.map((row) => row.key);
  }

  async hasAdmin(): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(roles.key, 'admin'))
      .limit(1);
    return Boolean(row);
  }

  async findLatestCode(
    type: AuthIdentityType,
    identifier: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | null> {
    const [row] = await this.db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.type, type),
          eq(verificationCodes.identifier, identifier),
          eq(verificationCodes.purpose, purpose),
        ),
      )
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);
    return row ?? null;
  }

  async countCodesSince(type: AuthIdentityType, identifier: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.type, type),
          eq(verificationCodes.identifier, identifier),
          gte(verificationCodes.createdAt, since),
        ),
      );
    return Number(row?.value ?? 0);
  }

  async incrementCodeAttempt(
    id: string,
    maxAttempts: number,
  ): Promise<VerificationCodeRecord | null> {
    const [row] = await this.db
      .update(verificationCodes)
      .set({ attemptCount: sql`${verificationCodes.attemptCount} + 1` })
      .where(
        and(
          eq(verificationCodes.id, id),
          isNull(verificationCodes.consumedAt),
          lt(verificationCodes.attemptCount, maxAttempts),
        ),
      )
      .returning();
    return row ?? null;
  }

  async consumeCode(id: string): Promise<boolean> {
    const rows = await this.db
      .update(verificationCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(verificationCodes.id, id), isNull(verificationCodes.consumedAt)))
      .returning({ id: verificationCodes.id });
    return rows.length > 0;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    const [row] = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async touchSession(
    id: string,
    input: { lastSeenAt: Date; expiresAt: Date },
  ): Promise<AuthSessionRecord> {
    const [row] = await this.db
      .update(authSessions)
      .set({ lastSeenAt: input.lastSeenAt, expiresAt: input.expiresAt })
      .where(eq(authSessions.id, id))
      .returning();
    if (!row) throw new Error('更新会话失败');
    return row;
  }

  async revokeSession(id: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(authSessions.id, id));
  }

  async revokeSessionsForUser(userId: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }

  async countEventsSince(
    type: AuthEventType,
    identifierHash: string,
    since: Date,
  ): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.type, type),
          eq(authEvents.identifierHash, identifierHash),
          gte(authEvents.createdAt, since),
        ),
      );
    return Number(row?.value ?? 0);
  }

  async claimUnownedResources(userId: string): Promise<void> {
    await this.db.update(chatSessions).set({ ownerId: userId }).where(isNull(chatSessions.ownerId));
    await this.db.update(datasets).set({ ownerId: userId }).where(isNull(datasets.ownerId));
    await this.db.update(workflows).set({ ownerId: userId }).where(isNull(workflows.ownerId));
  }
}
