import { randomUUID } from 'node:crypto';
import {
  ChatMessageSchema,
  ChatSessionSchema,
  MessagePartSchema,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatSession,
  type MessagePart,
} from '@ai-engine/contracts';
import { desc, eq } from 'drizzle-orm';
import { chatMessages, chatSessions } from '../database/schema';
import type { AppDatabase } from '../database/pg-vector-store';

export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

const parseDatasetIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toSession = (row: {
  id: string;
  title: string;
  modelId: string;
  agentType: string;
  datasetIds: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ChatSession =>
  ChatSessionSchema.parse({
    id: row.id,
    title: row.title,
    modelId: row.modelId,
    agentType: row.agentType,
    datasetIds: parseDatasetIds(row.datasetIds),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

const toMessage = (row: {
  id: string;
  sessionId: string;
  role: string;
  parts: unknown;
  seq: number;
  status: string;
  createdAt: Date;
}): ChatMessage =>
  ChatMessageSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    parts: Array.isArray(row.parts)
      ? row.parts.map((part) => MessagePartSchema.parse(part))
      : [{ type: 'text', id: randomUUID(), text: '' }],
    seq: row.seq,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });

export type NewSessionInput = {
  title: string;
  modelId: string;
  datasetIds: string[];
  agentType?: ChatSession['agentType'];
};

export interface ChatRepository {
  createSession(input: NewSessionInput): Promise<ChatSession>;
  listSessions(): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSession | null>;
  updateSession(
    id: string,
    patch: Partial<{ title: string; datasetIds: string[]; modelId: string }>,
  ): Promise<ChatSession | null>;
  deleteSession(id: string): Promise<void>;
  listMessages(sessionId: string): Promise<ChatMessage[]>;
  appendMessage(input: {
    id?: string;
    sessionId: string;
    role: ChatMessage['role'];
    parts: MessagePart[];
    status?: ChatMessageStatus;
  }): Promise<ChatMessage>;
  updateMessage(
    id: string,
    patch: Partial<{ parts: MessagePart[]; status: ChatMessageStatus }>,
  ): Promise<void>;
}

export class InMemoryChatRepository implements ChatRepository {
  private readonly sessions = new Map<string, ChatSession>();
  private readonly messages = new Map<string, ChatMessage[]>();

  async createSession(input: NewSessionInput): Promise<ChatSession> {
    await Promise.resolve();
    const now = new Date().toISOString();
    const session = ChatSessionSchema.parse({
      id: randomUUID(),
      title: input.title,
      modelId: input.modelId,
      datasetIds: input.datasetIds,
      agentType: input.agentType ?? 'chat',
      createdAt: now,
      updatedAt: now,
    });
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return session;
  }

  async listSessions(): Promise<ChatSession[]> {
    await Promise.resolve();
    return [...this.sessions.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async getSession(id: string): Promise<ChatSession | null> {
    await Promise.resolve();
    return this.sessions.get(id) ?? null;
  }

  async updateSession(
    id: string,
    patch: Partial<{ title: string; datasetIds: string[]; modelId: string }>,
  ): Promise<ChatSession | null> {
    await Promise.resolve();
    const current = this.sessions.get(id);
    if (!current) return null;
    const next = ChatSessionSchema.parse({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    this.sessions.set(id, next);
    return next;
  }

  async deleteSession(id: string): Promise<void> {
    await Promise.resolve();
    this.sessions.delete(id);
    this.messages.delete(id);
  }

  async listMessages(sessionId: string): Promise<ChatMessage[]> {
    await Promise.resolve();
    return [...(this.messages.get(sessionId) ?? [])].sort((left, right) => left.seq - right.seq);
  }

  async appendMessage(input: {
    id?: string;
    sessionId: string;
    role: ChatMessage['role'];
    parts: MessagePart[];
    status?: ChatMessageStatus;
  }): Promise<ChatMessage> {
    await Promise.resolve();
    const existing = this.messages.get(input.sessionId) ?? [];
    const message = ChatMessageSchema.parse({
      id: input.id ?? randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      parts: input.parts,
      seq: existing.length,
      status: input.status ?? 'complete',
      createdAt: new Date().toISOString(),
    });
    this.messages.set(input.sessionId, [...existing, message]);
    const session = this.sessions.get(input.sessionId);
    if (session) {
      this.sessions.set(
        input.sessionId,
        ChatSessionSchema.parse({ ...session, updatedAt: message.createdAt }),
      );
    }
    return message;
  }

  async updateMessage(
    id: string,
    patch: Partial<{ parts: MessagePart[]; status: ChatMessageStatus }>,
  ): Promise<void> {
    await Promise.resolve();
    for (const [sessionId, list] of this.messages) {
      const index = list.findIndex((item) => item.id === id);
      if (index < 0) continue;
      const current = list[index];
      if (!current) return;
      const next = [...list];
      next[index] = ChatMessageSchema.parse({ ...current, ...patch });
      this.messages.set(sessionId, next);
      return;
    }
  }
}

export class DrizzleChatRepository implements ChatRepository {
  constructor(private readonly db: AppDatabase) {}

  async createSession(input: NewSessionInput): Promise<ChatSession> {
    const [row] = await this.db
      .insert(chatSessions)
      .values({
        title: input.title,
        agentType: input.agentType ?? 'chat',
        modelId: input.modelId,
        datasetIds: input.datasetIds,
      })
      .returning();
    if (!row) throw new Error('创建会话失败');
    return toSession(row);
  }

  async listSessions(): Promise<ChatSession[]> {
    const rows = await this.db.select().from(chatSessions).orderBy(desc(chatSessions.updatedAt));
    return rows.map(toSession);
  }

  async getSession(id: string): Promise<ChatSession | null> {
    const [row] = await this.db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
    return row ? toSession(row) : null;
  }

  async updateSession(
    id: string,
    patch: Partial<{ title: string; datasetIds: string[]; modelId: string }>,
  ): Promise<ChatSession | null> {
    const [row] = await this.db
      .update(chatSessions)
      .set({
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.datasetIds === undefined ? {} : { datasetIds: patch.datasetIds }),
        ...(patch.modelId === undefined ? {} : { modelId: patch.modelId }),
        updatedAt: new Date(),
      })
      .where(eq(chatSessions.id, id))
      .returning();
    return row ? toSession(row) : null;
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(chatSessions).where(eq(chatSessions.id, id));
  }

  async listMessages(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.seq);
    return rows.map(toMessage);
  }

  async appendMessage(input: {
    id?: string;
    sessionId: string;
    role: ChatMessage['role'];
    parts: MessagePart[];
    status?: ChatMessageStatus;
  }): Promise<ChatMessage> {
    const existing = await this.listMessages(input.sessionId);
    const [row] = await this.db
      .insert(chatMessages)
      .values({
        ...(input.id ? { id: input.id } : {}),
        sessionId: input.sessionId,
        role: input.role,
        parts: input.parts,
        seq: existing.length,
        status: input.status ?? 'complete',
      })
      .returning();
    if (!row) throw new Error('写入消息失败');
    await this.db
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, input.sessionId));
    return toMessage(row);
  }

  async updateMessage(
    id: string,
    patch: Partial<{ parts: MessagePart[]; status: ChatMessageStatus }>,
  ): Promise<void> {
    await this.db
      .update(chatMessages)
      .set({
        ...(patch.parts === undefined ? {} : { parts: patch.parts }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      })
      .where(eq(chatMessages.id, id));
  }
}

export const createChatRepository = (
  db: AppDatabase | null,
  nodeEnv: 'development' | 'test' | 'production',
): ChatRepository => {
  if (nodeEnv === 'test' || !db) return new InMemoryChatRepository();
  return new DrizzleChatRepository(db);
};
