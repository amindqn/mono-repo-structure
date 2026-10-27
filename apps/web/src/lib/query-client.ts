import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';

export const queryKeys = {
  session: ['auth', 'session'] as const,
  health: ['health'] as const,
  tasks: (userId: string) => ['private', userId, 'tasks'] as const,
  media: (userId: string) => ['private', userId, 'media'] as const,
  mediaConfig: (userId: string) => ['private', userId, 'media-config'] as const,
  sessions: (userId: string) => ['private', userId, 'sessions'] as const,
};
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      },
      mutations: { retry: false },
    },
  });
}
export async function clearPrivateQueries(client: QueryClient) {
  await client.cancelQueries();
  client.removeQueries({ predicate: (query) => query.queryKey[0] === 'private' });
  client.getMutationCache().clear();
}
