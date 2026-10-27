import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
const date = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
export const userRole = pgEnum('user_role', ['user', 'admin']);
export const taskStatus = pgEnum('task_status', ['open', 'done']);
export const mediaStorage = pgEnum('media_storage', ['database', 'object']);
export const emailKind = pgEnum('email_kind', [
  'verify-email',
  'reset-password',
  'password-reset-notice',
]);
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  emailVerifiedAt: date('email_verified_at'),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 80 }).notNull(),
  bio: varchar('bio', { length: 500 }).notNull().default(''),
  avatarMediaId: uuid('avatar_media_id').references((): AnyPgColumn => media.id, {
    onDelete: 'set null',
  }),
  role: userRole('role').notNull().default('user'),
  createdAt: date('created_at').notNull(),
});
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: date('created_at').notNull(),
    expiresAt: date('expires_at').notNull(),
    lastUsedAt: date('last_used_at').notNull(),
    revokedAt: date('revoked_at'),
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_expiry_idx').on(table.expiresAt),
  ],
);
export const actionCredentials = pgTable(
  'action_credentials',
  {
    hash: varchar('hash', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailKind('purpose').notNull(),
    createdAt: date('created_at').notNull(),
    expiresAt: date('expires_at').notNull(),
  },
  (table) => [
    index('action_user_purpose_idx').on(table.userId, table.purpose),
    index('action_expiry_idx').on(table.expiresAt),
    check('action_purpose_valid', sql`${table.purpose} in ('verify-email', 'reset-password')`),
  ],
);
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: emailKind('kind').notNull(),
    createdAt: date('created_at').notNull(),
    availableAt: date('available_at').notNull(),
    leaseId: uuid('lease_id'),
    leaseUntil: date('lease_until'),
    attempts: integer('attempts').notNull().default(0),
    finishedAt: date('finished_at'),
  },
  (table) => [
    index('outbox_due_idx')
      .on(table.availableAt)
      .where(sql`${table.finishedAt} is null`),
    index('outbox_user_kind_idx').on(table.userId, table.kind, table.createdAt.desc()),
  ],
);
export const refreshCredentials = pgTable(
  'refresh_credentials',
  {
    hash: varchar('hash', { length: 64 }).primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    usedAt: date('used_at'),
  },
  (table) => [index('refresh_session_idx').on(table.sessionId)],
);
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 180 }).notNull(),
    contentType: varchar('content_type', { length: 64 }).notNull(),
    size: integer('size').notNull(),
    storage: mediaStorage('storage').notNull(),
    data: bytea('data'),
    createdAt: date('created_at').notNull(),
  },
  (table) => [
    index('media_owner_recent_idx').on(table.ownerId, table.createdAt.desc(), table.id.desc()),
    check('media_size_limit', sql`${table.size} > 0 and ${table.size} <= 5242880`),
    check(
      'media_data_consistency',
      sql`(${table.storage} = 'database' and ${table.data} is not null and octet_length(${table.data}) = ${table.size}) or (${table.storage} = 'object' and ${table.data} is null)`,
    ),
  ],
);
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    // Legacy unowned starter records are preserved but excluded from authenticated lists.
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 120 }).notNull(),
    status: taskStatus('status').notNull().default('open'),
    createdAt: date('created_at').notNull(),
  },
  (table) => [
    index('tasks_recent_idx').on(table.createdAt.desc(), table.id.desc()),
    index('tasks_owner_recent_idx').on(table.ownerId, table.createdAt.desc(), table.id.desc()),
    check('tasks_title_not_blank', sql`length(trim(${table.title})) > 0`),
  ],
);
