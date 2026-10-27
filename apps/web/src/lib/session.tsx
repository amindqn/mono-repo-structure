'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import type { LoginInput, RegisterInput, UserDto } from '@repo/contracts';
import { apiClient } from './api-client';
import { clearPrivateQueries, queryKeys } from './query-client';

function useSessionState() {
  const client = useQueryClient();
  const channel = useRef<BroadcastChannel | null>(null);
  const [notice, setNotice] = useState('');
  const session = useQuery({
    queryKey: queryKeys.session,
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.session(signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const replaceUser = useCallback(
    async (user: UserDto | null, message = '', broadcast = true) => {
      apiClient.sessionChanged();
      await clearPrivateQueries(client);
      client.setQueryData(queryKeys.session, user);
      setNotice(message);
      if (broadcast) channel.current?.postMessage('session-changed');
    },
    [client],
  );

  useEffect(() => {
    const expired = () => {
      void replaceUser(null, 'Your session ended. Please sign in again.');
    };
    window.addEventListener('forma:session-expired', expired);
    if (typeof BroadcastChannel !== 'undefined') {
      const connection = new BroadcastChannel('forma:session');
      channel.current = connection;
      connection.onmessage = () => {
        void (async () => {
          await replaceUser(null, '', false);
          await client.invalidateQueries({ queryKey: queryKeys.session });
        })();
      };
    }
    return () => {
      window.removeEventListener('forma:session-expired', expired);
      channel.current?.close();
      channel.current = null;
    };
  }, [client, replaceUser]);

  const login = useMutation({
    mutationFn: (input: LoginInput) => apiClient.login(input),
    onSuccess: (result) => replaceUser(result.user),
  });
  const register = useMutation({
    mutationFn: (input: RegisterInput) => apiClient.register(input),
  });
  const logout = useMutation({
    mutationFn: () => apiClient.logout(),
    onSuccess: () => replaceUser(null, 'You have signed out.'),
  });
  return {
    user: session.data ?? null,
    session,
    login,
    register,
    logout,
    notice,
    signedOut: (message: string) => replaceUser(null, message),
    updateUser: (user: UserDto) => client.setQueryData(queryKeys.session, user),
  };
}
const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessionState();
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider is required');
  return context;
}
