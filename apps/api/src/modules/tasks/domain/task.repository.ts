import type { Task, TaskStatus } from './task.js';

export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

/** Small persistence port. Updates are atomic; callers do not perform read-modify-write. */
export interface TaskRepository {
  listRecent(ownerId: string): Promise<Task[]>;
  add(task: Task): Promise<void>;
  changeStatus(id: string, status: TaskStatus, ownerId: string): Promise<Task | null>;
}
