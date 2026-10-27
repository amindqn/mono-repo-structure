import { AuthGate } from '@/features/auth/components/auth-gate';
import { AccountSettings } from '@/features/account/components/account-settings';
export default function Page() {
  return (
    <AuthGate>
      <AccountSettings />
    </AuthGate>
  );
}
