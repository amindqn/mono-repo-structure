import { Inject, Injectable, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Environment } from '../config/environment.js';
import { TASK_REPOSITORY } from '../modules/tasks/domain/task.repository.js';
import type { TaskRepository } from '../modules/tasks/domain/task.repository.js';
import { MemoryTaskRepository } from '../modules/tasks/infrastructure/memory-task.repository.js';
import { PostgresTaskRepository } from '../modules/tasks/infrastructure/postgres-task.repository.js';
import { createDatabase } from './database/connection.js';
import { IDENTITY_REPOSITORY } from '../modules/identity/domain/identity.repository.js';
import type { IdentityRepository } from '../modules/identity/domain/identity.repository.js';
import { MemoryIdentityRepository } from '../modules/identity/infrastructure/memory-identity.repository.js';
import { PostgresIdentityRepository } from '../modules/identity/infrastructure/postgres-identity.repository.js';
import { MEDIA_REPOSITORY } from '../modules/media/domain/media.js';
import type { MediaRepository } from '../modules/media/domain/media.js';
import { MemoryMediaRepository } from '../modules/media/infrastructure/memory-media.repository.js';
import { PostgresMediaRepository } from '../modules/media/infrastructure/postgres-media.repository.js';

export const PERSISTENCE = Symbol('PERSISTENCE');
export interface Persistence {
  mode: 'memory' | 'postgres';
  repository: TaskRepository;
  identity: IdentityRepository;
  media: MediaRepository;
  check(): Promise<void>;
  close(): Promise<void>;
}

function createPersistence(env: Environment): Persistence {
  if (env.PERSISTENCE === 'memory') {
    const media = new MemoryMediaRepository((id) => identity.unlinkAvatar(id));
    const identity: MemoryIdentityRepository = new MemoryIdentityRepository((ownerId, id) =>
      media.ownsImage(ownerId, id),
    );
    return {
      mode: 'memory',
      repository: new MemoryTaskRepository(),
      identity,
      media,
      check: async () => {},
      close: async () => {},
    };
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { pool, db } = createDatabase(env.DATABASE_URL);
  return {
    mode: 'postgres',
    repository: new PostgresTaskRepository(db),
    identity: new PostgresIdentityRepository(db),
    media: new PostgresMediaRepository(db),
    check: async () => {
      await db.execute(sql`select id, owner_id from tasks limit 0`);
      await db.execute(
        sql`select id, password_hash, avatar_media_id, email_verified_at from users limit 0`,
      );
      await db.execute(sql`select hash, purpose, expires_at from action_credentials limit 0`);
      await db.execute(
        sql`select id, lease_id, lease_until, finished_at from email_outbox limit 0`,
      );
      await db.execute(sql`select id, revoked_at from sessions limit 0`);
      await db.execute(sql`select hash, used_at from refresh_credentials limit 0`);
      await db.execute(sql`select id, storage, data from media limit 0`);
    },
    close: () => pool.end(),
  };
}

@Injectable()
class PersistenceLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PERSISTENCE) private readonly persistence: Persistence) {}
  async onApplicationShutdown() {
    await this.persistence.close();
  }
}

@Module({})
export class PersistenceModule {
  static register(env: Environment): DynamicModule {
    return {
      module: PersistenceModule,
      global: true,
      providers: [
        { provide: PERSISTENCE, useFactory: () => createPersistence(env) },
        {
          provide: TASK_REPOSITORY,
          inject: [PERSISTENCE],
          useFactory: (persistence: Persistence) => persistence.repository,
        },
        PersistenceLifecycle,
        {
          provide: IDENTITY_REPOSITORY,
          inject: [PERSISTENCE],
          useFactory: (persistence: Persistence) => persistence.identity,
        },
        {
          provide: MEDIA_REPOSITORY,
          inject: [PERSISTENCE],
          useFactory: (persistence: Persistence) => persistence.media,
        },
      ],
      exports: [PERSISTENCE, TASK_REPOSITORY, IDENTITY_REPOSITORY, MEDIA_REPOSITORY],
    };
  }
}
