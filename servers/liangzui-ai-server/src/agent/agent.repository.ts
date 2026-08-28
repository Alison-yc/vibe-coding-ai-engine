import { randomUUID } from 'node:crypto';
import {
  AgentInputSchema,
  PermissionRuleSchema,
  type AgentInput,
  type AgentMode,
  type AgentToolName,
  type PermissionRule,
} from '@ai-engine/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { agentPermissions, chatInputs } from '../database/schema';
import type { AppDatabase } from '../database/pg-vector-store';

export const AGENT_REPOSITORY = Symbol('AGENT_REPOSITORY');

export interface AgentRepository {
  enqueueInput(input: {
    sessionId: string;
    content: string;
    workspaceRoot: string;
    mode: AgentMode;
    fileAccess?: boolean;
  }): Promise<AgentInput>;
  claimInput(id: string): Promise<AgentInput | null>;
  completeInput(id: string, status: 'completed' | 'error'): Promise<void>;
  recoverInterruptedInputs(): Promise<void>;
  listQueuedInputs(): Promise<AgentInput[]>;
  listPermissionRules(sessionId: string): Promise<PermissionRule[]>;
  addSessionPermission(sessionId: string, tool: AgentToolName, resource: string): Promise<void>;
}

export class InMemoryAgentRepository implements AgentRepository {
  private readonly inputs = new Map<string, AgentInput>();
  private readonly permissions = new Map<string, PermissionRule[]>();

  async enqueueInput(input: {
    sessionId: string;
    content: string;
    workspaceRoot: string;
    mode: AgentMode;
    fileAccess?: boolean;
  }): Promise<AgentInput> {
    await Promise.resolve();
    const record = AgentInputSchema.parse({
      id: randomUUID(),
      ...input,
      delivery: 'pending',
      status: 'queued',
      createdAt: new Date().toISOString(),
    });
    this.inputs.set(record.id, record);
    return record;
  }

  async claimInput(id: string): Promise<AgentInput | null> {
    await Promise.resolve();
    const current = this.inputs.get(id);
    if (!current || current.status !== 'queued') return null;
    const claimed = AgentInputSchema.parse({
      ...current,
      delivery: 'promoted',
      status: 'processing',
    });
    this.inputs.set(claimed.id, claimed);
    return claimed;
  }

  async completeInput(id: string, status: 'completed' | 'error'): Promise<void> {
    await Promise.resolve();
    const current = this.inputs.get(id);
    if (current) this.inputs.set(id, AgentInputSchema.parse({ ...current, status }));
  }

  async recoverInterruptedInputs(): Promise<void> {
    await Promise.resolve();
    for (const [id, input] of this.inputs) {
      if (input.status === 'processing') {
        this.inputs.set(id, AgentInputSchema.parse({ ...input, status: 'error' }));
      }
    }
  }

  async listQueuedInputs(): Promise<AgentInput[]> {
    await Promise.resolve();
    return [...this.inputs.values()]
      .filter((input) => input.status === 'queued')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listPermissionRules(sessionId: string): Promise<PermissionRule[]> {
    await Promise.resolve();
    return [...(this.permissions.get(sessionId) ?? [])];
  }

  async addSessionPermission(
    sessionId: string,
    tool: AgentToolName,
    resource: string,
  ): Promise<void> {
    await Promise.resolve();
    const rules = this.permissions.get(sessionId) ?? [];
    this.permissions.set(sessionId, [
      ...rules,
      PermissionRuleSchema.parse({ tool, resource, effect: 'allow' }),
    ]);
  }
}

const toInput = (row: typeof chatInputs.$inferSelect): AgentInput =>
  AgentInputSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });

export class DrizzleAgentRepository implements AgentRepository {
  constructor(private readonly db: AppDatabase) {}

  async enqueueInput(input: {
    sessionId: string;
    content: string;
    workspaceRoot: string;
    mode: AgentMode;
    fileAccess?: boolean;
  }): Promise<AgentInput> {
    const [row] = await this.db
      .insert(chatInputs)
      .values({ ...input, delivery: 'pending', status: 'queued' })
      .returning();
    if (!row) throw new Error('Agent 输入入队失败');
    return toInput(row);
  }

  async claimInput(id: string): Promise<AgentInput | null> {
    const [row] = await this.db
      .update(chatInputs)
      .set({ delivery: 'promoted', status: 'processing' })
      .where(and(eq(chatInputs.id, id), eq(chatInputs.status, 'queued')))
      .returning();
    return row ? toInput(row) : null;
  }

  async completeInput(id: string, status: 'completed' | 'error'): Promise<void> {
    await this.db.update(chatInputs).set({ status }).where(eq(chatInputs.id, id));
  }

  async recoverInterruptedInputs(): Promise<void> {
    await this.db
      .update(chatInputs)
      .set({ status: 'error' })
      .where(eq(chatInputs.status, 'processing'));
  }

  async listQueuedInputs(): Promise<AgentInput[]> {
    const rows = await this.db
      .select()
      .from(chatInputs)
      .where(eq(chatInputs.status, 'queued'))
      .orderBy(asc(chatInputs.createdAt));
    return rows.map(toInput);
  }

  async listPermissionRules(sessionId: string): Promise<PermissionRule[]> {
    const rows = await this.db
      .select()
      .from(agentPermissions)
      .where(eq(agentPermissions.sessionId, sessionId))
      .orderBy(asc(agentPermissions.createdAt));
    return rows.map((row) =>
      PermissionRuleSchema.parse({
        tool: row.tool,
        resource: row.resource,
        effect: row.effect,
      }),
    );
  }

  async addSessionPermission(
    sessionId: string,
    tool: AgentToolName,
    resource: string,
  ): Promise<void> {
    await this.db.insert(agentPermissions).values({ sessionId, tool, resource, effect: 'allow' });
  }
}

export const createAgentRepository = (
  db: AppDatabase | null,
  nodeEnv: 'development' | 'test' | 'production',
): AgentRepository => {
  if (nodeEnv === 'test' || !db) return new InMemoryAgentRepository();
  return new DrizzleAgentRepository(db);
};
