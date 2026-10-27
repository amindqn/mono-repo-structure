import { ApiClient } from '@repo/api-client';

export const apiClient = new ApiClient({
  baseUrl: '/api/v1',
  onSessionExpired: () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('forma:session-expired'));
  },
});
