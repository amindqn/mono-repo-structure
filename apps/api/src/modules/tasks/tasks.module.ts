import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { TASK_REPOSITORY } from './domain/task.repository.js';
import type { TaskRepository } from './domain/task.repository.js';
import { CreateTask } from './application/create-task.js';
import { ListTasks } from './application/list-tasks.js';
import { ChangeTaskStatus } from './application/change-task-status.js';
import { TasksController } from './presentation/tasks.controller.js';

@Module({
  controllers: [TasksController],
  providers: [
    {
      provide: CreateTask,
      inject: [TASK_REPOSITORY],
      useFactory: (repository: TaskRepository) =>
        new CreateTask(repository, randomUUID, () => new Date()),
    },
    {
      provide: ListTasks,
      inject: [TASK_REPOSITORY],
      useFactory: (repository: TaskRepository) => new ListTasks(repository),
    },
    {
      provide: ChangeTaskStatus,
      inject: [TASK_REPOSITORY],
      useFactory: (repository: TaskRepository) => new ChangeTaskStatus(repository),
    },
  ],
})
export class TasksModule {}
