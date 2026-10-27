import type { TaskRepository } from '../domain/task.repository.js';

export class ListTasks {
  constructor(private readonly repository: TaskRepository) {}
  execute() {
    return this.repository.listRecent();
  }
}
