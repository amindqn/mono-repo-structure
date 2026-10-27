import { AuthGate } from '@/features/auth/components/auth-gate';
import { MediaWorkspace } from '@/features/media/components/media-workspace';
export default function Page() {
  return (
    <AuthGate>
      <MediaWorkspace />
    </AuthGate>
  );
}
