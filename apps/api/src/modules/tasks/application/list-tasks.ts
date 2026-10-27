import type { TaskRepository } from '../domain/task.repository.js';

export class ListTasks {
  constructor(private readonly repository: TaskRepository) {}
  execute(ownerId: string) {
    return this.repository.listRecent(ownerId);
  }
}
