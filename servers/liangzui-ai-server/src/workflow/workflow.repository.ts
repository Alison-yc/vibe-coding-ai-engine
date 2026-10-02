import { randomUUID } from 'node:crypto';
import {
  WorkflowGraphSchema,
  WorkflowSchema,
  WorkflowStatusSchema,
  type Workflow,
  type WorkflowGraph,
  type WorkflowStatus,
} from '@ai-engine/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDatabase } from '../database/pg-vector-store';
import { workflowNodeRuns, workflowRuns, workflows } from '../database/schema';

export const WORKFLOW_REPOSITORY = Symbol('WORKFLOW_REPOSITORY');

export type WorkflowRunRecord = {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown> | null;
  graphSnapshot: WorkflowGraph;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type WorkflowNodeRunRecord = {
  id: string;
  runId: string;
  nodeId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown> | null;
  elapsedMs: number;
  error: string | null;
  createdAt: Date;
};

export type WorkflowPatch = Partial<{ name: string; graph: WorkflowGraph; bumpVersion?: boolean }>;

/**
 * 工作流读写一律带 `ownerId`，他人工作流与不存在同样返回 null。
 * 运行记录、节点运行记录是子表：`getRun` 经父工作流判断归属，其余调用方必须先确认父工作流。
 */
export interface WorkflowRepository {
  createWorkflow(ownerId: string, input: { name: string; graph: WorkflowGraph }): Promise<Workflow>;
  listWorkflows(ownerId: string): Promise<Workflow[]>;
  getWorkflow(ownerId: string, id: string): Promise<Workflow | null>;
  updateWorkflow(ownerId: string, id: string, patch: WorkflowPatch): Promise<Workflow | null>;
  deleteWorkflow(ownerId: string, id: string): Promise<boolean>;
  createRun(
    workflowId: string,
    inputs: Record<string, unknown>,
    graphSnapshot: WorkflowGraph,
  ): Promise<WorkflowRunRecord>;
  getRun(ownerId: string, id: string): Promise<WorkflowRunRecord | null>;
  listRuns(workflowId: string): Promise<WorkflowRunRecord[]>;
  updateRun(
    id: string,
    patch: Partial<{
      status: WorkflowStatus;
      outputs: Record<string, unknown> | null;
      error: string | null;
      finishedAt: Date | null;
    }>,
  ): Promise<void>;
  createNodeRun(input: {
    runId: string;
    nodeId: string;
    inputs: Record<string, unknown>;
  }): Promise<WorkflowNodeRunRecord>;
  updateNodeRun(
    id: string,
    patch: Partial<{
      status: WorkflowNodeRunRecord['status'];
      outputs: Record<string, unknown> | null;
      elapsedMs: number;
      error: string | null;
    }>,
  ): Promise<void>;
  listNodeRuns(runId: string): Promise<WorkflowNodeRunRecord[]>;
}

const toWorkflow = (row: {
  id: string;
  name: string;
  graph: unknown;
  version: number;
  createdAt: Date;
}): Workflow =>
  WorkflowSchema.parse({
    ...row,
    graph: WorkflowGraphSchema.parse(row.graph),
    createdAt: row.createdAt.toISOString(),
  });

const cloneRecord = <T>(value: T): T => structuredClone(value);
const UnknownRecordSchema = z.record(z.string(), z.unknown());

const toRunRecord = (row: typeof workflowRuns.$inferSelect): WorkflowRunRecord => ({
  ...row,
  status: WorkflowStatusSchema.parse(row.status),
  inputs: UnknownRecordSchema.parse(row.inputs),
  outputs: row.outputs === null ? null : UnknownRecordSchema.parse(row.outputs),
  graphSnapshot: WorkflowGraphSchema.parse(row.graphSnapshot),
});

const toNodeRunRecord = (row: typeof workflowNodeRuns.$inferSelect): WorkflowNodeRunRecord => ({
  ...row,
  status: WorkflowStatusSchema.parse(row.status),
  inputs: UnknownRecordSchema.parse(row.inputs),
  outputs: row.outputs === null ? null : UnknownRecordSchema.parse(row.outputs),
});

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly workflowRecords = new Map<string, Workflow>();
  private readonly runRecords = new Map<string, WorkflowRunRecord>();
  private readonly nodeRunRecords = new Map<string, WorkflowNodeRunRecord>();
  private readonly owners = new Map<string, string>();

  private owned(ownerId: string, id: string): Workflow | null {
    if (this.owners.get(id) !== ownerId) return null;
    return this.workflowRecords.get(id) ?? null;
  }

  async createWorkflow(
    ownerId: string,
    input: { name: string; graph: WorkflowGraph },
  ): Promise<Workflow> {
    await Promise.resolve();
    const record = WorkflowSchema.parse({
      id: randomUUID(),
      name: input.name,
      graph: input.graph,
      version: 1,
      createdAt: new Date().toISOString(),
    });
    this.workflowRecords.set(record.id, record);
    this.owners.set(record.id, ownerId);
    return cloneRecord(record);
  }

  async listWorkflows(ownerId: string): Promise<Workflow[]> {
    await Promise.resolve();
    return [...this.workflowRecords.values()]
      .filter((record) => this.owners.get(record.id) === ownerId)
      .map(cloneRecord);
  }

  async getWorkflow(ownerId: string, id: string): Promise<Workflow | null> {
    await Promise.resolve();
    const record = this.owned(ownerId, id);
    return record ? cloneRecord(record) : null;
  }

  async updateWorkflow(
    ownerId: string,
    id: string,
    patch: WorkflowPatch,
  ): Promise<Workflow | null> {
    await Promise.resolve();
    const current = this.owned(ownerId, id);
    if (!current) return null;
    const bumpVersion = patch.bumpVersion ?? false;
    const { bumpVersion: _ignored, ...data } = patch;
    const next = WorkflowSchema.parse({
      ...current,
      ...data,
      version: bumpVersion ? current.version + 1 : current.version,
    });
    this.workflowRecords.set(id, next);
    return cloneRecord(next);
  }

  async deleteWorkflow(ownerId: string, id: string): Promise<boolean> {
    await Promise.resolve();
    if (!this.owned(ownerId, id)) return false;
    this.workflowRecords.delete(id);
    this.owners.delete(id);
    const runIds = new Set(
      [...this.runRecords.values()]
        .filter((record) => record.workflowId === id)
        .map((record) => record.id),
    );
    for (const runId of runIds) this.runRecords.delete(runId);
    for (const [nodeRunId, record] of this.nodeRunRecords) {
      if (runIds.has(record.runId)) this.nodeRunRecords.delete(nodeRunId);
    }
    return true;
  }

  async createRun(
    workflowId: string,
    inputs: Record<string, unknown>,
    graphSnapshot: WorkflowGraph,
  ): Promise<WorkflowRunRecord> {
    await Promise.resolve();
    const record: WorkflowRunRecord = {
      id: randomUUID(),
      workflowId,
      status: 'running',
      inputs: cloneRecord(inputs),
      outputs: null,
      graphSnapshot: cloneRecord(graphSnapshot),
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    this.runRecords.set(record.id, record);
    return cloneRecord(record);
  }

  async updateRun(
    id: string,
    patch: Partial<{
      status: WorkflowStatus;
      outputs: Record<string, unknown> | null;
      error: string | null;
      finishedAt: Date | null;
    }>,
  ): Promise<void> {
    await Promise.resolve();
    const current = this.runRecords.get(id);
    if (current) this.runRecords.set(id, { ...current, ...cloneRecord(patch) });
  }

  async getRun(ownerId: string, id: string): Promise<WorkflowRunRecord | null> {
    await Promise.resolve();
    const record = this.runRecords.get(id);
    if (!record || this.owners.get(record.workflowId) !== ownerId) return null;
    return cloneRecord(record);
  }

  async listRuns(workflowId: string): Promise<WorkflowRunRecord[]> {
    await Promise.resolve();
    return [...this.runRecords.values()]
      .filter((record) => record.workflowId === workflowId)
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
      .map(cloneRecord);
  }

  async createNodeRun(input: {
    runId: string;
    nodeId: string;
    inputs: Record<string, unknown>;
  }): Promise<WorkflowNodeRunRecord> {
    await Promise.resolve();
    const record: WorkflowNodeRunRecord = {
      id: randomUUID(),
      ...input,
      inputs: cloneRecord(input.inputs),
      status: 'running',
      outputs: null,
      elapsedMs: 0,
      error: null,
      createdAt: new Date(),
    };
    this.nodeRunRecords.set(record.id, record);
    return cloneRecord(record);
  }

  async updateNodeRun(
    id: string,
    patch: Partial<{
      status: WorkflowNodeRunRecord['status'];
      outputs: Record<string, unknown> | null;
      elapsedMs: number;
      error: string | null;
    }>,
  ): Promise<void> {
    await Promise.resolve();
    const current = this.nodeRunRecords.get(id);
    if (current) this.nodeRunRecords.set(id, { ...current, ...cloneRecord(patch) });
  }

  async listNodeRuns(runId: string): Promise<WorkflowNodeRunRecord[]> {
    await Promise.resolve();
    return [...this.nodeRunRecords.values()]
      .filter((record) => record.runId === runId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map(cloneRecord);
  }
}

const ownedWorkflow = (ownerId: string, id: string) =>
  and(eq(workflows.id, id), eq(workflows.ownerId, ownerId));

export class DrizzleWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: AppDatabase) {}

  async createWorkflow(
    ownerId: string,
    input: { name: string; graph: WorkflowGraph },
  ): Promise<Workflow> {
    const [row] = await this.db
      .insert(workflows)
      .values({ ...input, ownerId })
      .returning();
    if (!row) throw new Error('创建工作流失败');
    return toWorkflow(row);
  }

  async listWorkflows(ownerId: string): Promise<Workflow[]> {
    const rows = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.ownerId, ownerId))
      .orderBy(desc(workflows.createdAt));
    return rows.map(toWorkflow);
  }

  async getWorkflow(ownerId: string, id: string): Promise<Workflow | null> {
    const [row] = await this.db.select().from(workflows).where(ownedWorkflow(ownerId, id)).limit(1);
    return row ? toWorkflow(row) : null;
  }

  async updateWorkflow(
    ownerId: string,
    id: string,
    patch: WorkflowPatch,
  ): Promise<Workflow | null> {
    const current = await this.getWorkflow(ownerId, id);
    if (!current) return null;
    const bumpVersion = patch.bumpVersion ?? false;
    const { bumpVersion: _ignored, ...data } = patch;
    const [row] = await this.db
      .update(workflows)
      .set({
        ...data,
        version: bumpVersion ? current.version + 1 : current.version,
      })
      .where(ownedWorkflow(ownerId, id))
      .returning();
    return row ? toWorkflow(row) : null;
  }

  async deleteWorkflow(ownerId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(workflows)
      .where(ownedWorkflow(ownerId, id))
      .returning({ id: workflows.id });
    return rows.length > 0;
  }

  async createRun(
    workflowId: string,
    inputs: Record<string, unknown>,
    graphSnapshot: WorkflowGraph,
  ): Promise<WorkflowRunRecord> {
    const [row] = await this.db
      .insert(workflowRuns)
      .values({ workflowId, inputs, graphSnapshot, status: 'running' })
      .returning();
    if (!row) throw new Error('创建工作流运行记录失败');
    return toRunRecord(row);
  }

  async updateRun(
    id: string,
    patch: Partial<{
      status: WorkflowStatus;
      outputs: Record<string, unknown> | null;
      error: string | null;
      finishedAt: Date | null;
    }>,
  ): Promise<void> {
    await this.db.update(workflowRuns).set(patch).where(eq(workflowRuns.id, id));
  }

  async getRun(ownerId: string, id: string): Promise<WorkflowRunRecord | null> {
    const [row] = await this.db
      .select({ run: workflowRuns })
      .from(workflowRuns)
      .innerJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
      .where(and(eq(workflowRuns.id, id), eq(workflows.ownerId, ownerId)))
      .limit(1);
    return row ? toRunRecord(row.run) : null;
  }

  async listRuns(workflowId: string): Promise<WorkflowRunRecord[]> {
    const rows = await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(desc(workflowRuns.startedAt));
    return rows.map(toRunRecord);
  }

  async createNodeRun(input: {
    runId: string;
    nodeId: string;
    inputs: Record<string, unknown>;
  }): Promise<WorkflowNodeRunRecord> {
    const [row] = await this.db
      .insert(workflowNodeRuns)
      .values({ ...input, status: 'running' })
      .returning();
    if (!row) throw new Error('创建节点运行记录失败');
    return toNodeRunRecord(row);
  }

  async updateNodeRun(
    id: string,
    patch: Partial<{
      status: WorkflowNodeRunRecord['status'];
      outputs: Record<string, unknown> | null;
      elapsedMs: number;
      error: string | null;
    }>,
  ): Promise<void> {
    await this.db.update(workflowNodeRuns).set(patch).where(eq(workflowNodeRuns.id, id));
  }

  async listNodeRuns(runId: string): Promise<WorkflowNodeRunRecord[]> {
    const rows = await this.db
      .select()
      .from(workflowNodeRuns)
      .where(eq(workflowNodeRuns.runId, runId))
      .orderBy(workflowNodeRuns.createdAt);
    return rows.map(toNodeRunRecord);
  }
}

export const createWorkflowRepository = (
  db: AppDatabase | null,
  nodeEnv: 'development' | 'test' | 'production',
): WorkflowRepository => {
  if (db) return new DrizzleWorkflowRepository(db);
  if (nodeEnv === 'production') throw new Error('生产环境需要 PostgreSQL 工作流仓储');
  return new InMemoryWorkflowRepository();
};
