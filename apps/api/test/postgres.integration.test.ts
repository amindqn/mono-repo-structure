import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDatabase } from '../dist/infrastructure/database/connection.js';
import { tasks } from '../dist/infrastructure/database/schema.js';
import { PostgresTaskRepository } from '../dist/modules/tasks/infrastructure/postgres-task.repository.js';
import { Task } from '../dist/modules/tasks/domain/task.js';
import { taskSchema } from '@repo/contracts';
import { createApplication } from '../dist/app.js';
import { parseEnvironment } from '../dist/config/environment.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL test database');
const { db, pool } = createDatabase(url);
const repository = new PostgresTaskRepository(db);
const id = randomUUID();
const createdIds: string[] = [id];

beforeAll(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
});
afterAll(async () => {
  try {
    for (const createdId of createdIds) await db.delete(tasks).where(eq(tasks.id, createdId));
  } finally {
    await pool.end();
  }
});

it('keeps HTTP-created tasks after closing and recreating the Nest application', async () => {
  const env = parseEnvironment({ NODE_ENV: 'test', PERSISTENCE: 'postgres', DATABASE_URL: url });
  const firstApp = await createApplication(env);
  let createdId: string;
  try {
    const ready = await firstApp
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(ready.statusCode).toBe(200);
    const response = await firstApp
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/api/v1/tasks',
        payload: { title: 'Persist through app restart' },
      });
    expect(response.statusCode).toBe(201);
    createdId = taskSchema.parse(response.json()).id;
    createdIds.push(createdId);
  } finally {
    await firstApp.close();
  }
  const secondApp = await createApplication(env);
  try {
    const response = await secondApp
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'PATCH', url: `/api/v1/tasks/${createdId}`, payload: { status: 'done' } });
    expect(response.statusCode).toBe(200);
    expect(taskSchema.parse(response.json()).status).toBe('done');
  } finally {
    await secondApp.close();
  }
});

it('applies migrations, persists through separate adapters, and atomically updates status', async () => {
  await repository.add(
    Task.create({ id, title: 'PostgreSQL integration', createdAt: new Date().toISOString() }),
  );
  const second = new PostgresTaskRepository(db);
  expect((await second.listRecent()).some((task) => task.id === id)).toBe(true);
  expect((await second.changeStatus(id, 'done'))?.toSnapshot().status).toBe('done');
  expect(await second.changeStatus(randomUUID(), 'done')).toBeNull();
  await expect(
    db
      .insert(tasks)
      .values({ id: randomUUID(), title: ' ', status: 'open', createdAt: new Date() }),
  ).rejects.toThrow();
});
