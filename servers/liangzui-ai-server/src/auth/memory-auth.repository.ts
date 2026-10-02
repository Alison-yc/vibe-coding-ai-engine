/* eslint-disable @typescript-eslint/require-await -- 与 Drizzle 的异步接口同形，内存里没有 I/O */
import { randomUUID } from 'node:crypto';
import type {
  AuthClient,
  AuthEventType,
  AuthIdentityRecord,
  AuthIdentityType,
  AuthRepository,
  AuthSessionRecord,
  AuthUserKind,
  AuthUserPatch,
  AuthUserRecord,
  VerificationCodeRecord,
  VerificationPurpose,
} from './auth.repository';

const uniqueViolation = (): Error => Object.assign(new Error('duplicate'), { code: '23505' });

export class MemoryAuthRepository implements AuthRepository {
  readonly users: AuthUserRecord[] = [];
  readonly identities: AuthIdentityRecord[] = [];
  readonly codes: VerificationCodeRecord[] = [];
  readonly sessions: AuthSessionRecord[] = [];
  readonly events: Array<{
    id: string;
    userId: string | null;
    type: AuthEventType;
    identifierHash: string | null;
    createdAt: Date;
  }> = [];
  readonly roleGrants: Array<{ userId: string; roleKey: string }> = [];
  readonly orphans: Array<{ ownerId: string | null }> = [];
  failIdentityOnce = false;
  private ticks = 0;

  async transaction<T>(run: (repo: AuthRepository) => Promise<T>): Promise<T> {
    return run(this);
  }

  async lockFirstAdmin(): Promise<void> {
    return undefined;
  }

  async insertUser(input: {
    kind: AuthUserKind;
    displayName?: string | null;
    passwordHash?: string | null;
    status?: 'active' | 'disabled';
  }): Promise<AuthUserRecord> {
    const now = this.stamp();
    const row: AuthUserRecord = {
      id: randomUUID(),
      kind: input.kind,
      displayName: input.displayName ?? null,
      passwordHash: input.passwordHash ?? null,
      status: input.status ?? 'active',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(row);
    return row;
  }

  async updateUser(id: string, patch: AuthUserPatch): Promise<AuthUserRecord> {
    const row = this.users.find((user) => user.id === id);
    if (!row) throw new Error('更新用户失败');
    Object.assign(row, patch);
    return row;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async insertIdentity(input: {
    userId: string;
    type: AuthIdentityType;
    identifier: string;
    verifiedAt?: Date | null;
  }): Promise<AuthIdentityRecord> {
    if (this.failIdentityOnce) {
      this.failIdentityOnce = false;
      throw uniqueViolation();
    }
    if (
      this.identities.some((row) => row.type === input.type && row.identifier === input.identifier)
    ) {
      throw uniqueViolation();
    }
    const row: AuthIdentityRecord = {
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      identifier: input.identifier,
      verifiedAt: input.verifiedAt ?? null,
      createdAt: this.stamp(),
    };
    this.identities.push(row);
    return row;
  }

  async findIdentity(
    type: AuthIdentityType,
    identifier: string,
  ): Promise<AuthIdentityRecord | null> {
    return (
      this.identities.find((row) => row.type === type && row.identifier === identifier) ?? null
    );
  }

  async listIdentities(userId: string): Promise<AuthIdentityRecord[]> {
    return this.identities
      .filter((row) => row.userId === userId)
      .slice()
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async grantRole(userId: string, roleKey: string): Promise<unknown> {
    if (this.roleGrants.some((row) => row.userId === userId && row.roleKey === roleKey)) {
      throw new Error('授予角色失败');
    }
    const row = { userId, roleKey };
    this.roleGrants.push(row);
    return row;
  }

  async revokeRole(userId: string, roleKey: string): Promise<void> {
    const index = this.roleGrants.findIndex(
      (row) => row.userId === userId && row.roleKey === roleKey,
    );
    if (index >= 0) this.roleGrants.splice(index, 1);
  }

  async listRoleKeys(userId: string): Promise<string[]> {
    return this.roleGrants.filter((row) => row.userId === userId).map((row) => row.roleKey);
  }

  async hasAdmin(): Promise<boolean> {
    return this.roleGrants.some((row) => row.roleKey === 'admin');
  }

  async insertVerificationCode(input: {
    type: AuthIdentityType;
    identifier: string;
    purpose: VerificationPurpose;
    codeHash: string;
    expiresAt: Date;
  }): Promise<VerificationCodeRecord> {
    const row: VerificationCodeRecord = {
      id: randomUUID(),
      type: input.type,
      identifier: input.identifier,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      attemptCount: 0,
      createdAt: this.stamp(),
    };
    this.codes.push(row);
    return row;
  }

  async findLatestCode(
    type: AuthIdentityType,
    identifier: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRecord | null> {
    const matches = this.codes
      .filter(
        (row) => row.type === type && row.identifier === identifier && row.purpose === purpose,
      )
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return matches[0] ?? null;
  }

  async countCodesSince(type: AuthIdentityType, identifier: string, since: Date): Promise<number> {
    return this.codes.filter(
      (row) =>
        row.type === type &&
        row.identifier === identifier &&
        row.createdAt.getTime() >= since.getTime(),
    ).length;
  }

  async incrementCodeAttempt(
    id: string,
    maxAttempts: number,
  ): Promise<VerificationCodeRecord | null> {
    const row = this.codes.find((code) => code.id === id);
    if (!row || row.consumedAt || row.attemptCount >= maxAttempts) return null;
    row.attemptCount += 1;
    return row;
  }

  async consumeCode(id: string): Promise<boolean> {
    const row = this.codes.find((code) => code.id === id);
    if (!row || row.consumedAt) return false;
    row.consumedAt = new Date();
    return true;
  }

  async insertSession(input: {
    userId: string;
    tokenHash: string;
    client: AuthClient;
    expiresAt: Date;
    userAgent?: string | null;
  }): Promise<AuthSessionRecord> {
    const now = this.stamp();
    const row: AuthSessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      client: input.client,
      userAgent: input.userAgent ?? null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.sessions.push(row);
    return row;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    return this.sessions.find((row) => row.tokenHash === tokenHash) ?? null;
  }

  async touchSession(
    id: string,
    input: { lastSeenAt: Date; expiresAt: Date },
  ): Promise<AuthSessionRecord> {
    const row = this.sessions.find((session) => session.id === id);
    if (!row) throw new Error('更新会话失败');
    row.lastSeenAt = input.lastSeenAt;
    row.expiresAt = input.expiresAt;
    return row;
  }

  async revokeSession(id: string): Promise<void> {
    const row = this.sessions.find((session) => session.id === id);
    if (row) row.revokedAt = new Date();
  }

  async revokeSessionsForUser(userId: string): Promise<void> {
    const now = new Date();
    for (const row of this.sessions) {
      if (row.userId === userId && !row.revokedAt) row.revokedAt = now;
    }
  }

  async listActiveSessions(userId: string, now: Date): Promise<AuthSessionRecord[]> {
    return this.sessions
      .filter(
        (row) =>
          row.userId === userId &&
          row.revokedAt === null &&
          row.expiresAt.getTime() >= now.getTime(),
      )
      .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime());
  }

  async revokeOwnedSession(userId: string, sessionId: string): Promise<boolean> {
    const row = this.sessions.find(
      (session) => session.id === sessionId && session.userId === userId,
    );
    if (!row || row.revokedAt) return false;
    row.revokedAt = new Date();
    return true;
  }

  async deleteExpiredSessions(now: Date): Promise<number> {
    const before = this.sessions.length;
    const kept = this.sessions.filter(
      (row) => row.revokedAt === null && row.expiresAt.getTime() >= now.getTime(),
    );
    this.sessions.splice(0, this.sessions.length, ...kept);
    return before - this.sessions.length;
  }

  async deleteStaleGuests(lastSeenBefore: Date): Promise<number> {
    const activeGuestIds = new Set(
      this.sessions
        .filter((row) => row.lastSeenAt.getTime() >= lastSeenBefore.getTime())
        .map((row) => row.userId),
    );
    const staleIds = new Set(
      this.users
        .filter((user) => user.kind === 'guest' && !activeGuestIds.has(user.id))
        .map((user) => user.id),
    );
    if (staleIds.size === 0) return 0;
    this.users.splice(0, this.users.length, ...this.users.filter((user) => !staleIds.has(user.id)));
    this.sessions.splice(
      0,
      this.sessions.length,
      ...this.sessions.filter((row) => !staleIds.has(row.userId)),
    );
    this.identities.splice(
      0,
      this.identities.length,
      ...this.identities.filter((row) => !staleIds.has(row.userId)),
    );
    this.roleGrants.splice(
      0,
      this.roleGrants.length,
      ...this.roleGrants.filter((row) => !staleIds.has(row.userId)),
    );
    return staleIds.size;
  }

  async insertEvent(input: {
    userId?: string | null;
    type: AuthEventType;
    identifierHash?: string | null;
  }): Promise<unknown> {
    const row = {
      id: randomUUID(),
      userId: input.userId ?? null,
      type: input.type,
      identifierHash: input.identifierHash ?? null,
      createdAt: this.stamp(),
    };
    this.events.push(row);
    return row;
  }

  async countEventsSince(
    type: AuthEventType,
    identifierHash: string,
    since: Date,
  ): Promise<number> {
    return this.events.filter(
      (row) =>
        row.type === type &&
        row.identifierHash === identifierHash &&
        row.createdAt.getTime() >= since.getTime(),
    ).length;
  }

  async claimUnownedResources(userId: string): Promise<void> {
    for (const row of this.orphans) {
      if (row.ownerId === null) row.ownerId = userId;
    }
  }

  private stamp(): Date {
    this.ticks += 1;
    return new Date(Date.now() + this.ticks);
  }
}
