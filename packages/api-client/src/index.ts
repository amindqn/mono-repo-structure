import {
  apiProblemSchema,
  createTaskSchema,
  healthSchema,
  taskListSchema,
  taskSchema,
  updateTaskSchema,
} from '@repo/contracts';
import type { CreateTaskInput, UpdateTaskInput } from '@repo/contracts';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Facade over HTTP; injected fetch keeps transport replaceable in tests and other runtimes. */
export class ApiClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: { baseUrl: string; fetch?: typeof fetch }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  listTasks(signal?: AbortSignal) {
    return this.request(taskListSchema, '/tasks', { ...(signal ? { signal } : {}) });
  }

  createTask(input: CreateTaskInput) {
    return this.request(taskSchema, '/tasks', {
      method: 'POST',
      body: JSON.stringify(createTaskSchema.parse(input)),
    });
  }

  updateTask(id: string, input: UpdateTaskInput) {
    return this.request(taskSchema, `/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updateTaskSchema.parse(input)),
    });
  }

  health(signal?: AbortSignal) {
    return this.request(healthSchema, '/health/ready', { ...(signal ? { signal } : {}) });
  }

  private async request<T extends z.ZodType>(
    schema: T,
    path: string,
    init: RequestInit = {},
  ): Promise<z.output<T>> {
    const timeout = AbortSignal.timeout(10_000);
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = apiProblemSchema.safeParse(body);
      throw new ApiError(
        response.status,
        problem.success ? problem.data.message : 'The request failed. Please try again.',
        problem.success ? problem.data.requestId : undefined,
      );
    }
    return schema.parse(body);
  }
}
