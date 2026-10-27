import type { TaskStatus } from '../domain/task.js';
import type { TaskRepository } from '../domain/task.repository.js';
import { TaskNotFound } from './task-not-found.js';

export class ChangeTaskStatus {
  constructor(private readonly repository: TaskRepository) {}
  async execute(id: string, status: TaskStatus, ownerId: string) {
    const task = await this.repository.changeStatus(id, status, ownerId);
    if (!task) throw new TaskNotFound();
    return task;
  }
}
