import type { Metadata } from 'next';
import { EmailRequestForm } from '@/features/auth/components/email-flows';
export const metadata: Metadata = {
  title: 'Forgot Password — Forma',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <EmailRequestForm kind="password" />;
}
