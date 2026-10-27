import type { Metadata } from 'next';
import { EmailActionForm } from '@/features/auth/components/email-flows';
export const metadata: Metadata = {
  title: 'Reset Password — Forma',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <EmailActionForm kind="password" />;
}
