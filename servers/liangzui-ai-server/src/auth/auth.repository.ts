import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../database/pg-vector-store';
import {
  authEvents,
  authSessions,
  roles,
  userIdentities,
  userRoles,
  users,
  verificationCodes,
} from '../database/schema';

export type AuthUserKind = 'guest' | 'registered';
export type AuthIdentityType = 'email' | 'phone';
export type AuthClient = 'web' | 'desktop';

export class DrizzleAuthRepository {
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
}
