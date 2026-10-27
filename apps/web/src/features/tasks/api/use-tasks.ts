'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateTaskInput } from '@repo/contracts';
import { apiClient } from '@/lib/api-client';

const taskKeys = { all: ['tasks'] as const };

export function useTasks() {
  const client = useQueryClient();
  const tasks = useQuery({
    queryKey: taskKeys.all,
    queryFn: ({ signal }) => apiClient.listTasks(signal),
  });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiClient.health(signal),
    refetchInterval: 30_000,
  });
  const invalidate = () => client.invalidateQueries({ queryKey: taskKeys.all });
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
