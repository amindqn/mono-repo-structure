import type { Task, TaskStatus } from './task.js';

export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

/** Small persistence port. Updates are atomic; callers do not perform read-modify-write. */
export interface TaskRepository {
  listRecent(): Promise<Task[]>;
  add(task: Task): Promise<void>;
  changeStatus(id: string, status: TaskStatus): Promise<Task | null>;
}
