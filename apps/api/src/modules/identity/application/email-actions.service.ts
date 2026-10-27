import type { ActionPurpose, ActionTokens, EmailJob } from '../domain/email.ports.js';
import type { EmailRepository } from '../domain/email.ports.js';
import type { PasswordHasher } from '../domain/security.ports.js';
import { ApplicationError } from '../../../common/application-error.js';

export const acceptedEmail = {
  message: 'If this address is eligible, an email will arrive shortly.',
} as const;
export class EmailActionsService {
  constructor(
    private readonly repository: EmailRepository,
    private readonly tokens: ActionTokens,
    private readonly passwords: PasswordHasher,
    private readonly newId: () => string,
    private readonly now: () => Date,
  ) {}
  newJob(userId: string, kind: EmailJob['kind']): EmailJob {
    const now = this.now().toISOString();
    return {
      id: this.newId(),
      userId,
      kind,
      createdAt: now,
      availableAt: now,
      attempts: 0,
      leaseId: null,
      leaseUntil: null,
      finishedAt: null,
    };
  }
  async request(email: string, purpose: ActionPurpose) {
    await this.repository.queueEmail(email, this.newJob('', purpose));
    return acceptedEmail;
  }
  async verify(token: string, password: string) {
    const hash = this.tokens.hash(token, 'verify-email');
    const account = await this.repository.verificationAccount(hash, this.now().toISOString());
    if (!account || !(await this.passwords.verify(password, account.passwordHash)))
      throw this.invalid(true);
    if (!(await this.repository.verifyEmail(hash, account.passwordHash, this.now().toISOString())))
      throw this.invalid(true);
  }
  async reset(token: string, newPassword: string) {
    const hash = this.tokens.hash(token, 'reset-password');
    if (!(await this.repository.actionExists(hash, 'reset-password', this.now().toISOString())))
      throw this.invalid();
    const nextHash = await this.passwords.hash(newPassword);
    if (
      !(await this.repository.resetPassword(
        hash,
        nextHash,
        this.now().toISOString(),
        this.newJob('', 'password-reset-notice'),
      ))
    )
      throw this.invalid();
  }
  private invalid(verification = false) {
    return new ApplicationError(
      400,
      'INVALID_ACTION_TOKEN',
      verification
        ? 'The link is invalid or expired, or the account password is incorrect. Use password recovery if needed.'
        : 'This link is invalid or expired. Request a new email.',
    );
  }
}
