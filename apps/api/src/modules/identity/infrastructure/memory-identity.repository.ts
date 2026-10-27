import type { Account, RefreshCredential, RefreshResult, Session } from '../domain/identity.js';
import type {
  ActionCredential,
  ActionPurpose,
  ClaimedEmail,
  EmailJob,
} from '../domain/email.ports.js';
import type { IdentityRepository } from '../domain/identity.repository.js';

export class MemoryIdentityRepository implements IdentityRepository {
  private readonly accounts = new Map<string, Account>();
  private readonly sessions = new Map<string, Session>();
  private readonly refresh = new Map<string, RefreshCredential>();
  private readonly actions = new Map<string, ActionCredential>();
  private readonly outbox = new Map<string, EmailJob>();
  constructor(private readonly ownsImage: (ownerId: string, mediaId: string) => boolean) {}
  async findByEmail(email: string) {
    return [...this.accounts.values()].find((account) => account.email === email) ?? null;
  }
  async findById(id: string) {
    return this.accounts.get(id) ?? null;
  }
  async register(account: Account, emailJob: EmailJob) {
    if ([...this.accounts.values()].some((value) => value.email === account.email)) return false;
    this.accounts.set(account.id, { ...account });
    this.outbox.set(emailJob.id, { ...emailJob });
    return true;
  }
  async createSession(
    accountId: string,
    verifiedPasswordHash: string,
    session: Session,
    refresh: RefreshCredential,
  ) {
    if (
      !this.accounts.get(accountId)?.emailVerifiedAt ||
      this.accounts.get(accountId)?.passwordHash !== verifiedPasswordHash
    )
      return false;
    this.sessions.set(session.id, { ...session });
    this.refresh.set(refresh.hash, { ...refresh });
    return true;
  }
  async rotateRefresh(hash: string, nextHash: string, now: string): Promise<RefreshResult> {
    const credential = this.refresh.get(hash);
    const session = credential && this.sessions.get(credential.sessionId);
    const account = session && this.accounts.get(session.userId);
    if (
      !credential ||
      !session ||
      !account?.emailVerifiedAt ||
      session.revokedAt ||
      session.expiresAt <= now
    )
      return { kind: 'invalid' };
    if (credential.usedAt) {
      this.sessions.set(session.id, { ...session, revokedAt: now });
      return { kind: 'reused' };
    }
    this.refresh.set(hash, { ...credential, usedAt: now });
    this.refresh.set(nextHash, { hash: nextHash, sessionId: session.id, usedAt: null });
    const updated = { ...session, lastUsedAt: now };
    this.sessions.set(session.id, updated);
    return { kind: 'ok', account: { ...account }, session: updated };
  }
  async revokeByRefresh(hash: string, now: string) {
    const credential = this.refresh.get(hash);
    if (!credential) return;
    const session = this.sessions.get(credential.sessionId);
    if (session) this.sessions.set(session.id, { ...session, revokedAt: now });
  }
  async revokeSession(userId: string, sessionId: string, now: string) {
    const session = this.sessions.get(sessionId);
    if (session?.userId === userId) this.sessions.set(sessionId, { ...session, revokedAt: now });
  }
  async activeAccount(userId: string, sessionId: string, now: string) {
    const session = this.sessions.get(sessionId);
    return this.accounts.get(userId)?.emailVerifiedAt &&
      session?.userId === userId &&
      !session.revokedAt &&
      session.expiresAt > now
      ? (this.accounts.get(userId) ?? null)
      : null;
  }
  async listSessions(userId: string, now: string) {
    return [...this.sessions.values()]
      .filter(
        (session) => session.userId === userId && !session.revokedAt && session.expiresAt > now,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map((session) => ({ ...session }));
  }
  async updateProfile(id: string, profile: Pick<Account, 'displayName' | 'bio' | 'avatarMediaId'>) {
    const account = this.accounts.get(id);
    if (!account || (profile.avatarMediaId && !this.ownsImage(id, profile.avatarMediaId)))
      return null;
    const updated = { ...account, ...profile };
    this.accounts.set(id, updated);
    return { ...updated };
  }
  async changePassword(id: string, previousHash: string, nextHash: string, now: string) {
    const account = this.accounts.get(id);
    if (!account || account.passwordHash !== previousHash) return false;
    this.cancelActions(id, 'reset-password', now);
    this.accounts.set(id, { ...account, passwordHash: nextHash });
    for (const session of this.sessions.values())
      if (session.userId === id) this.sessions.set(session.id, { ...session, revokedAt: now });
    return true;
  }
  async queueEmail(email: string, job: EmailJob) {
    const account = [...this.accounts.values()].find((value) => value.email === email);
    if (!account || (job.kind === 'verify-email' && account.emailVerifiedAt)) return;
    const recent = [...this.outbox.values()].filter(
      (value) =>
        value.userId === account.id &&
        value.kind === job.kind &&
        value.createdAt > new Date(Date.parse(job.createdAt) - 3_600_000).toISOString(),
    );
    if (
      recent.length >= 5 ||
      recent.some(
        (value) => value.createdAt > new Date(Date.parse(job.createdAt) - 60_000).toISOString(),
      )
    )
      return;
    this.outbox.set(job.id, { ...job, userId: account.id });
  }
  async claimEmail(now: string, leaseId: string, leaseUntil: string): Promise<ClaimedEmail | null> {
    const job = [...this.outbox.values()].find(
      (value) =>
        !value.finishedAt &&
        value.availableAt <= now &&
        (!value.leaseUntil || value.leaseUntil <= now),
    );
    if (!job) return null;
    const account = this.accounts.get(job.userId);
    if (!account) return null;
    const claimed = { ...job, leaseId, leaseUntil, attempts: job.attempts + 1 };
    this.outbox.set(job.id, claimed);
    return { ...claimed, account: { ...account } };
  }
  async prepareEmailAction(job: ClaimedEmail, credential: ActionCredential, now: string) {
    const stored = this.outbox.get(job.id);
    const account = this.accounts.get(job.userId);
    if (
      !stored ||
      stored.leaseId !== job.leaseId ||
      stored.finishedAt ||
      !stored.leaseUntil ||
      stored.leaseUntil <= now ||
      !account ||
      (job.kind === 'verify-email' && account.emailVerifiedAt)
    )
      return false;
    for (const action of this.actions.values())
      if (action.userId === job.userId && action.purpose === credential.purpose)
        this.actions.delete(action.hash);
    this.actions.set(credential.hash, { ...credential });
    return true;
  }
  async finishEmail(job: ClaimedEmail, now: string, retryAt: string | null) {
    const stored = this.outbox.get(job.id);
    if (!stored || stored.leaseId !== job.leaseId || stored.finishedAt) return;
    this.outbox.set(job.id, {
      ...stored,
      leaseId: null,
      leaseUntil: null,
      ...(retryAt ? { availableAt: retryAt } : { finishedAt: now }),
    });
  }
  async actionExists(hash: string, purpose: ActionPurpose, now: string) {
    const action = this.actions.get(hash);
    return Boolean(action && action.purpose === purpose && action.expiresAt > now);
  }
  async verificationAccount(hash: string, now: string) {
    const action = this.actions.get(hash);
    if (!action || action.purpose !== 'verify-email' || action.expiresAt <= now) return null;
    const account = this.accounts.get(action.userId);
    return account && !account.emailVerifiedAt ? { ...account } : null;
  }
  async verifyEmail(hash: string, passwordHash: string, now: string) {
    const action = this.actions.get(hash);
    if (!action || action.purpose !== 'verify-email' || action.expiresAt <= now) return false;
    const account = this.accounts.get(action.userId);
    if (!account || account.emailVerifiedAt || account.passwordHash !== passwordHash) return false;
    this.accounts.set(account.id, { ...account, emailVerifiedAt: now });
    this.cancelActions(account.id, 'verify-email', now);
    return true;
  }
  async resetPassword(hash: string, nextHash: string, now: string, notice: EmailJob) {
    const action = this.actions.get(hash);
    if (!action || action.purpose !== 'reset-password' || action.expiresAt <= now) return false;
    const account = this.accounts.get(action.userId);
    if (!account) return false;
    this.accounts.set(account.id, { ...account, passwordHash: nextHash });
    this.cancelActions(account.id, 'reset-password', now);
    for (const session of this.sessions.values())
      if (session.userId === account.id)
        this.sessions.set(session.id, { ...session, revokedAt: now });
    this.outbox.set(notice.id, { ...notice, userId: account.id });
    return true;
  }
  private cancelActions(userId: string, purpose: ActionPurpose, now: string) {
    for (const action of this.actions.values())
      if (action.userId === userId && action.purpose === purpose) this.actions.delete(action.hash);
    for (const job of this.outbox.values())
      if (job.userId === userId && job.kind === purpose && !job.finishedAt)
        this.outbox.set(job.id, { ...job, finishedAt: now });
  }
  unlinkAvatar(mediaId: string) {
    for (const account of this.accounts.values())
      if (account.avatarMediaId === mediaId)
        this.accounts.set(account.id, { ...account, avatarMediaId: null });
  }
}
