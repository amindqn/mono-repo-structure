import { z } from 'zod';

export const taskStatusSchema = z.enum(['open', 'done']);
export const createTaskSchema = z.strictObject({ title: z.string().trim().min(1).max(120) });
export const updateTaskSchema = z.strictObject({ status: taskStatusSchema });
export const taskSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  status: taskStatusSchema,
  createdAt: z.iso.datetime(),
});
export const taskListSchema = z.strictObject({ items: z.array(taskSchema).max(100) });
export const healthSchema = z.strictObject({
  status: z.literal('ok'),
  persistence: z.enum(['memory', 'postgres']),
});
export const apiProblemSchema = z.object({
  status: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
});

export type TaskDto = z.infer<typeof taskSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ApiProblem = z.infer<typeof apiProblemSchema>;
