'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StorageKind } from '@repo/contracts';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { useSession } from '@/lib/session';

export function useMedia() {
  const client = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? 'guest';
  const assets = useQuery({
    queryKey: queryKeys.media(userId),
    enabled: Boolean(user),
    queryFn: ({ signal }) => apiClient.listMedia(signal),
  });
  const config = useQuery({
    queryKey: queryKeys.mediaConfig(userId),
    enabled: Boolean(user),
    queryFn: () => apiClient.mediaConfig(),
    staleTime: 5 * 60_000,
  });
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => apiClient.health(signal),
  });
  const upload = useMutation({
    mutationFn: ({ file, storage }: { file: File; storage: StorageKind }) =>
      apiClient.uploadMedia(file, storage),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.media(userId) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.deleteMedia(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.media(userId) });
      await client.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
  return { assets, config, upload, remove, health };
}
