import { TaskWorkspace } from '@/features/tasks/components/task-workspace';
import { AuthGate } from '@/features/auth/components/auth-gate';

export default function Page() {
  return (
    <AuthGate>
      <TaskWorkspace />
    </AuthGate>
  );
}
