import { Task } from '../domain/task.js';
import type { TaskStatus } from '../domain/task.js';
import type { TaskRepository } from '../domain/task.repository.js';

/** Development/test adapter. State belongs to one application instance. */
export class MemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();

  async listRecent(): Promise<Task[]> {
    return [...this.tasks.values()]
      .sort((a, b) => {
        const left = a.toSnapshot();
        const right = b.toSnapshot();
        return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
      })
      .slice(0, 100);
  }

  async add(task: Task): Promise<void> {
    if (this.tasks.has(task.id)) throw new Error('Task identifier already exists');
    this.tasks.set(task.id, task);
  }

  async changeStatus(id: string, status: TaskStatus): Promise<Task | null> {
    const task = this.tasks.get(id);
    if (!task) return null;
    const changed = Task.restore({ ...task.toSnapshot(), status });
    this.tasks.set(id, changed);
    return changed;
  }
}
