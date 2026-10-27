import { desc, eq } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/connection.js';
import { tasks } from '../../../infrastructure/database/schema.js';
import { Task } from '../domain/task.js';
import type { TaskStatus } from '../domain/task.js';
import type { TaskRepository } from '../domain/task.repository.js';

function toDomain(row: typeof tasks.$inferSelect): Task {
  return Task.restore({ ...row, createdAt: row.createdAt.toISOString() });
}

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly db: Database) {}

  async listRecent(): Promise<Task[]> {
    return (
      await this.db.select().from(tasks).orderBy(desc(tasks.createdAt), desc(tasks.id)).limit(100)
    ).map(toDomain);
  }

  async add(task: Task): Promise<void> {
    const snapshot = task.toSnapshot();
    await this.db.insert(tasks).values({ ...snapshot, createdAt: new Date(snapshot.createdAt) });
  }

  async changeStatus(id: string, status: TaskStatus): Promise<Task | null> {
    const [row] = await this.db.update(tasks).set({ status }).where(eq(tasks.id, id)).returning();
    return row ? toDomain(row) : null;
  }
}
