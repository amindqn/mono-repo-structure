import { createTaskSchema, taskListSchema, taskSchema, updateTaskSchema } from '@repo/contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateTaskDto extends createZodDto(createTaskSchema) {}
export class UpdateTaskDto extends createZodDto(updateTaskSchema) {}
export class TaskDto extends createZodDto(taskSchema) {}
export class TaskListDto extends createZodDto(taskListSchema) {}
