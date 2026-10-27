import type { Account, Session } from '../domain/identity.js';
import { publicAccount } from '../domain/identity.js';
import type { IdentityRepository } from '../domain/identity.repository.js';
import type { PasswordHasher, TokenService } from '../domain/security.ports.js';
import { ApplicationError } from '../../../common/application-error.js';
import { acceptedEmail, EmailActionsService } from './email-actions.service.js';

export class AuthService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly newId: () => string,
    private readonly now: () => Date,
    private readonly sessionLifetimeSeconds: number,
    private readonly emails: EmailActionsService,
  ) {}

  async register(input: { email: string; password: string; displayName: string }) {
    const createdAt = this.now().toISOString();
    const account: Account = {
      id: this.newId(),
      email: input.email,
      emailVerifiedAt: null,
      passwordHash: await this.passwords.hash(input.password),
      displayName: input.displayName,
      bio: '',
      avatarMediaId: null,
      role: 'user',
      createdAt,
    };
    await this.repository.register(account, this.emails.newJob(account.id, 'verify-email'));
    return acceptedEmail;
  }

  async login(input: { email: string; password: string }) {
    const account = await this.repository.findByEmail(input.email);
    const verified = await this.passwords.verify(input.password, account?.passwordHash ?? null);
    if (!account || !verified)
      throw new ApplicationError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    if (!account.emailVerifiedAt)
      throw new ApplicationError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verify your email before signing in. You can request a new verification email.',
      );
    const session = this.newSession(account.id);
    const refresh = this.tokens.createRefresh();
    const access = await this.tokens.createAccess(account.id, session.id);
    if (
      !(await this.repository.createSession(account.id, account.passwordHash, session, {
        hash: refresh.hash,
        sessionId: session.id,
        usedAt: null,
      }))
    )
      throw new ApplicationError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    return this.credentials(account, session, access, refresh.token);
  }

  async refresh(raw: string | undefined) {
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
      throw new ApplicationError(401, 'SESSION_EXPIRED', 'Please sign in again');
    const hash = this.tokens.hashRefresh(raw);
    const next = this.tokens.createRefresh();
    // The repository determines the session from the presented hash, never from caller input.
    const result = await this.repository.rotateRefresh(hash, next.hash, this.now().toISOString());
    if (result.kind !== 'ok')
      throw new ApplicationError(401, 'SESSION_EXPIRED', 'Please sign in again');
    const access = await this.tokens.createAccess(result.account.id, result.session.id);
    return this.credentials(result.account, result.session, access, next.token);
  }

  async logout(raw: string | undefined) {
    if (raw && /^[A-Za-z0-9_-]{43}$/.test(raw))
      await this.repository.revokeByRefresh(this.tokens.hashRefresh(raw), this.now().toISOString());
  }

  async changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
    const account = await this.repository.findById(userId);
    if (!account || !(await this.passwords.verify(input.currentPassword, account.passwordHash)))
      throw new ApplicationError(400, 'PASSWORD_MISMATCH', 'Current password is incorrect');
    const next = await this.passwords.hash(input.newPassword);
    if (
      !(await this.repository.changePassword(
        userId,
        account.passwordHash,
        next,
        this.now().toISOString(),
      ))
    )
      throw new ApplicationError(
        409,
        'ACCOUNT_CHANGED',
        'Your account changed. Sign in and try again',
      );
  }

  private newSession(userId: string): Session {
    const now = this.now();
    return {
      id: this.newId(),
      userId,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.sessionLifetimeSeconds * 1000).toISOString(),
      revokedAt: null,
    };
  }
  private credentials(
    account: Account,
    session: Session,
    access: { token: string; expiresAt: string },
    refreshToken: string,
  ) {
    return {
      body: {
        user: publicAccount(account),
        accessExpiresAt: access.expiresAt,
        sessionExpiresAt: session.expiresAt,
      },
      accessToken: access.token,
      refreshToken,
    };
  }
}
