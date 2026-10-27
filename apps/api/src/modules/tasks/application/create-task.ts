import { Task } from '../domain/task.js';
import type { TaskRepository } from '../domain/task.repository.js';

/** Command with explicit clock/identity dependencies for deterministic behavior. */
export class CreateTask {
  constructor(
    private readonly repository: TaskRepository,
    private readonly newId: () => string,
    private readonly now: () => Date,
  ) {}

  async execute(title: string): Promise<Task> {
    const task = Task.create({ id: this.newId(), title, createdAt: this.now().toISOString() });
    await this.repository.add(task);
    return task;
  }
}
