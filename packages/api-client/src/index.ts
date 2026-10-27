import { z } from 'zod';
import {
  acceptedEmailSchema,
  emailRequestSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  apiProblemSchema,
  authSessionSchema,
  changePasswordSchema,
  createTaskSchema,
  CSRF_HEADER,
  healthSchema,
  loginSchema,
  mediaConfigSchema,
  mediaListSchema,
  mediaSchema,
  registerSchema,
  sessionListSchema,
  sessionPresenceSchema,
  storageSchema,
  taskListSchema,
  taskSchema,
  updateProfileSchema,
  updateTaskSchema,
  userSchema,
} from '@repo/contracts';
import type {
  EmailRequestInput,
  ResetPasswordInput,
  ChangePasswordInput,
  CreateTaskInput,
  LoginInput,
  RegisterInput,
  StorageKind,
  UpdateProfileInput,
  UpdateTaskInput,
} from '@repo/contracts';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly requestId?: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Validated transport facade; tokens stay in HttpOnly cookies rather than application state. */
export class ApiClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly onSessionExpired: () => void;
  private refreshing: Promise<boolean> | null = null;
  private generation = 0;
  constructor(options: { baseUrl: string; fetch?: typeof fetch; onSessionExpired?: () => void }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.onSessionExpired = options.onSessionExpired ?? (() => {});
  }
  sessionChanged() {
    this.generation++;
  }
  async session(signal?: AbortSignal) {
    const presence = await this.request(
      sessionPresenceSchema,
      '/auth/session',
      signal ? { signal } : {},
    );
    return presence.present ? this.me(signal) : null;
  }
  me(signal?: AbortSignal) {
    return this.request(userSchema, '/auth/me', signal ? { signal } : {});
  }
  register(input: RegisterInput) {
    return this.request(acceptedEmailSchema, '/auth/register', {
      method: 'POST',
      body: JSON.stringify(registerSchema.parse(input)),
    });
  }
  login(input: LoginInput) {
    return this.request(authSessionSchema, '/auth/login', {
      method: 'POST',
      body: JSON.stringify(loginSchema.parse(input)),
    });
  }
  resendVerification(input: EmailRequestInput) {
    return this.request(acceptedEmailSchema, '/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(emailRequestSchema.parse(input)),
    });
  }
  forgotPassword(input: EmailRequestInput) {
    return this.request(acceptedEmailSchema, '/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(emailRequestSchema.parse(input)),
    });
  }
  verifyEmail(token: string, password: string) {
    return this.request(z.undefined(), '/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(verifyEmailSchema.parse({ token, password })),
    });
  }
  resetPassword(input: ResetPasswordInput) {
    return this.request(z.undefined(), '/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(resetPasswordSchema.parse(input)),
    });
  }
  logout() {
    return this.request(z.undefined(), '/auth/logout', { method: 'POST' });
  }
  updateProfile(input: UpdateProfileInput) {
    return this.request(userSchema, '/users/me', {
      method: 'PATCH',
      body: JSON.stringify(updateProfileSchema.parse(input)),
    });
  }
  changePassword(input: ChangePasswordInput) {
    return this.request(z.undefined(), '/auth/password', {
      method: 'POST',
      body: JSON.stringify(changePasswordSchema.parse(input)),
    });
  }
  sessions(signal?: AbortSignal) {
    return this.request(sessionListSchema, '/auth/sessions', signal ? { signal } : {});
  }
  revokeSession(id: string) {
    return this.request(z.undefined(), `/auth/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  listTasks(signal?: AbortSignal) {
    return this.request(taskListSchema, '/tasks', signal ? { signal } : {});
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
    return this.request(healthSchema, '/health/ready', signal ? { signal } : {});
  }
  listMedia(signal?: AbortSignal) {
    return this.request(mediaListSchema, '/media', signal ? { signal } : {});
  }
  mediaConfig() {
    return this.request(mediaConfigSchema, '/media/config');
  }
  uploadMedia(file: File, storage: StorageKind) {
    const form = new FormData();
    form.append('file', file);
    return this.request(mediaSchema, `/media/upload?storage=${storageSchema.parse(storage)}`, {
      method: 'POST',
      body: form,
    });
  }
  deleteMedia(id: string) {
    return this.request(z.undefined(), `/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  downloadMedia(id: string) {
    return this.execute(`/media/${encodeURIComponent(id)}/content`, {}, (response) =>
      response.blob(),
    );
  }

  private request<T extends z.ZodType>(
    schema: T,
    path: string,
    init: RequestInit = {},
  ): Promise<z.output<T>> {
    return this.execute(path, init, async (response) =>
      schema.parse(response.status === 204 ? undefined : await response.json()),
    );
  }
  private async execute<T>(
    path: string,
    init: RequestInit,
    decode: (response: Response) => Promise<T>,
    retried = false,
    generation = this.generation,
  ): Promise<T> {
    const response = await this.raw(path, init);
    if (generation !== this.generation)
      throw new ApiError(
        409,
        'Your session changed. Please try again.',
        undefined,
        'SESSION_CHANGED',
      );
    const renewable =
      !/^\/auth\/(register|login|refresh|logout|verify-email|resend-verification|forgot-password|reset-password)(?:\?|$)/.test(
        path,
      );
    if (response.status === 401 && !retried && renewable) {
      if (!this.refreshing)
        this.refreshing = this.refreshSession().finally(() => {
          this.refreshing = null;
        });
      const refreshed = await this.refreshing;
      if (generation !== this.generation) throw new ApiError(401, 'Please sign in again');
      if (refreshed) return this.execute(path, init, decode, true, generation);
      this.onSessionExpired();
    }
    if (!response.ok) throw await this.problem(response);
    return decode(response);
  }
  private raw(path: string, init: RequestInit = {}) {
    const timeout = AbortSignal.timeout(path.startsWith('/media/upload') ? 30_000 : 10_000);
    const form = typeof FormData !== 'undefined' && init.body instanceof FormData;
    const unsafe = !['GET', 'HEAD'].includes(init.method ?? 'GET');
    return this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      headers: {
        Accept: 'application/json',
        ...(init.body && !form ? { 'Content-Type': 'application/json' } : {}),
        ...(unsafe ? { [CSRF_HEADER]: '1' } : {}),
      },
    });
  }
  private async refreshSession(): Promise<boolean> {
    const refresh = async () => {
      // A different tab may have refreshed cookies while this request waited for the browser lock.
      const current = await this.raw('/auth/me');
      if (current.ok) return true;
      if (current.status !== 401) throw await this.problem(current);
      const response = await this.raw('/auth/refresh', { method: 'POST' });
      if (response.status === 401) return false;
      if (!response.ok) throw await this.problem(response);
      authSessionSchema.parse(await response.json());
      return true;
    };
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request('forma:refresh-session', refresh);
    return refresh();
  }
  private async problem(response: Response) {
    const body: unknown = await response.json().catch(() => null);
    const problem = apiProblemSchema.safeParse(body);
    return new ApiError(
      response.status,
      problem.success ? problem.data.message : 'The request failed. Please try again.',
      problem.success ? problem.data.requestId : undefined,
      problem.success ? problem.data.code : undefined,
    );
  }
}
