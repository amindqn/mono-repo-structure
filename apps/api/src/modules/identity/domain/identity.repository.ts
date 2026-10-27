import type { Account, RefreshCredential, RefreshResult, Session } from './identity.js';
import type { EmailJob, EmailRepository } from './email.ports.js';

export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');
export interface IdentityRepository extends EmailRepository {
  findByEmail(email: string): Promise<Account | null>;
  findById(id: string): Promise<Account | null>;
  register(account: Account, emailJob: EmailJob): Promise<boolean>;
  createSession(
    accountId: string,
    verifiedPasswordHash: string,
    session: Session,
    refresh: RefreshCredential,
  ): Promise<boolean>;
  rotateRefresh(hash: string, nextHash: string, now: string): Promise<RefreshResult>;
  revokeByRefresh(hash: string, now: string): Promise<void>;
  revokeSession(userId: string, sessionId: string, now: string): Promise<void>;
  activeAccount(userId: string, sessionId: string, now: string): Promise<Account | null>;
  listSessions(userId: string, now: string): Promise<Session[]>;
  updateProfile(
    id: string,
    profile: Pick<Account, 'displayName' | 'bio' | 'avatarMediaId'>,
  ): Promise<Account | null>;
  changePassword(id: string, previousHash: string, nextHash: string, now: string): Promise<boolean>;
}
