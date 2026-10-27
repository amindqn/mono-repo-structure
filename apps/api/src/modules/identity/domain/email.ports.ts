import type { Account } from './identity.js';

export type ActionPurpose = 'verify-email' | 'reset-password';
export type EmailKind = ActionPurpose | 'password-reset-notice';
export interface ActionCredential {
  hash: string;
  userId: string;
  purpose: ActionPurpose;
  createdAt: string;
  expiresAt: string;
}
export interface EmailJob {
  id: string;
  userId: string;
  kind: EmailKind;
  createdAt: string;
  availableAt: string;
  leaseId: string | null;
  leaseUntil: string | null;
  attempts: number;
  finishedAt: string | null;
}
export interface ClaimedEmail extends EmailJob {
  account: Account;
  leaseId: string;
}
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}
export const EMAIL_DELIVERY = Symbol('EMAIL_DELIVERY');
export const ACTION_TOKENS = Symbol('ACTION_TOKENS');
export interface EmailDelivery {
  send(message: EmailMessage): Promise<void>;
}
export interface ActionTokens {
  create(purpose: ActionPurpose): { token: string; hash: string };
  hash(token: string, purpose: ActionPurpose): string;
}

/** Outbox and single-use credential operations form a separate application port. */
export interface EmailRepository {
  queueEmail(email: string, job: EmailJob): Promise<void>;
  claimEmail(now: string, leaseId: string, leaseUntil: string): Promise<ClaimedEmail | null>;
  prepareEmailAction(
    job: ClaimedEmail,
    credential: ActionCredential,
    now: string,
  ): Promise<boolean>;
  finishEmail(job: ClaimedEmail, now: string, retryAt: string | null): Promise<void>;
  actionExists(hash: string, purpose: ActionPurpose, now: string): Promise<boolean>;
  verificationAccount(hash: string, now: string): Promise<Account | null>;
  verifyEmail(hash: string, passwordHash: string, now: string): Promise<boolean>;
  resetPassword(hash: string, nextHash: string, now: string, notice: EmailJob): Promise<boolean>;
}
