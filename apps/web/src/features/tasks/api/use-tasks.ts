'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateTaskInput } from '@repo/contracts';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { useSession } from '@/lib/session';

export function useTasks() {
  const client = useQueryClient();
  const { user } = useSession();
  const taskKey = queryKeys.tasks(user?.id ?? 'guest');
  const tasks = useQuery({
    queryKey: taskKey,
    enabled: Boolean(user),
    queryFn: ({ signal }) => apiClient.listTasks(signal),
  });
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => apiClient.health(signal),
    refetchInterval: 30_000,
  });
  const invalidate = () => client.invalidateQueries({ queryKey: taskKey });
  const create = useMutation({
    mutationFn: (title: string) => apiClient.createTask({ title }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, status }: UpdateTaskInput & { id: string }) =>
      apiClient.updateTask(id, { status }),
    onSuccess: invalidate,
  });
  return { tasks, health, create, update };
}
