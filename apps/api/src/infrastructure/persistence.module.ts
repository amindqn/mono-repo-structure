import { Inject, Injectable, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Environment } from '../config/environment.js';
import { TASK_REPOSITORY } from '../modules/tasks/domain/task.repository.js';
import type { TaskRepository } from '../modules/tasks/domain/task.repository.js';
import { MemoryTaskRepository } from '../modules/tasks/infrastructure/memory-task.repository.js';
import { PostgresTaskRepository } from '../modules/tasks/infrastructure/postgres-task.repository.js';
import { createDatabase } from './database/connection.js';

export const PERSISTENCE = Symbol('PERSISTENCE');
export interface Persistence {
  mode: 'memory' | 'postgres';
  repository: TaskRepository;
  check(): Promise<void>;
  close(): Promise<void>;
}

function createPersistence(env: Environment): Persistence {
  if (env.PERSISTENCE === 'memory') {
    return {
      mode: 'memory',
      repository: new MemoryTaskRepository(),
      check: async () => {},
      close: async () => {},
    };
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { pool, db } = createDatabase(env.DATABASE_URL);
  return {
    mode: 'postgres',
    repository: new PostgresTaskRepository(db),
    check: async () => {
      await db.execute(sql`select id from tasks limit 0`);
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
      ],
      exports: [PERSISTENCE, TASK_REPOSITORY],
    };
  }
}
