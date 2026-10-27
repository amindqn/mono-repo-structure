import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const taskStatus = pgEnum('task_status', ['open', 'done']);
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    title: varchar('title', { length: 120 }).notNull(),
    status: taskStatus('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    index('tasks_recent_idx').on(table.createdAt.desc(), table.id.desc()),
    check('tasks_title_not_blank', sql`length(trim(${table.title})) > 0`),
  ],
);
