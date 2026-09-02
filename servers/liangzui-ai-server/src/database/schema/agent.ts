import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chatSessions } from './chat';

export const agentPermissions = pgTable('agent_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => chatSessions.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  resource: text('resource').notNull(),
  effect: text('effect').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
