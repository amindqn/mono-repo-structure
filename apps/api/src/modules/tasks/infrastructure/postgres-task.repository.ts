import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/connection.js';
import { tasks } from '../../../infrastructure/database/schema.js';
import { Task } from '../domain/task.js';
import type { TaskStatus } from '../domain/task.js';
import type { TaskRepository } from '../domain/task.repository.js';

function toDomain(row: typeof tasks.$inferSelect): Task {
  if (!row.ownerId) throw new Error('Legacy unowned task cannot enter an authenticated query');
  return Task.restore({ ...row, ownerId: row.ownerId, createdAt: row.createdAt.toISOString() });
}

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly db: Database) {}

  async listRecent(ownerId: string): Promise<Task[]> {
    return (
      await this.db
        .select()
        .from(tasks)
        .where(eq(tasks.ownerId, ownerId))
        .orderBy(desc(tasks.createdAt), desc(tasks.id))
        .limit(100)
    ).map(toDomain);
  }

  async add(task: Task): Promise<void> {
    const snapshot = task.toSnapshot();
    await this.db.insert(tasks).values({ ...snapshot, createdAt: new Date(snapshot.createdAt) });
  }

  async changeStatus(id: string, status: TaskStatus, ownerId: string): Promise<Task | null> {
    const [row] = await this.db
      .update(tasks)
      .set({ status })
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning();
    return row ? toDomain(row) : null;
  }
}
