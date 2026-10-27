import type { TaskStatus } from '../domain/task.js';
import type { TaskRepository } from '../domain/task.repository.js';
import { TaskNotFound } from './task-not-found.js';

export class ChangeTaskStatus {
  constructor(private readonly repository: TaskRepository) {}
  async execute(id: string, status: TaskStatus) {
    const task = await this.repository.changeStatus(id, status);
    if (!task) throw new TaskNotFound();
    return task;
  }
}
