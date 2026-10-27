import type { ActionTokens, ClaimedEmail, EmailDelivery } from '../domain/email.ports.js';
import type { EmailRepository } from '../domain/email.ports.js';

/** Leased outbox delivery: raw action credentials live only during a delivery attempt. */
export class EmailProcessor {
  private running: Promise<void> | null = null;
  constructor(
    private readonly repository: EmailRepository,
    private readonly delivery: EmailDelivery,
    private readonly tokens: ActionTokens,
    private readonly origin: string,
    private readonly newId: () => string,
    private readonly now: () => Date,
    private readonly onFailure: () => void,
  ) {}
  flush() {
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  idle() {
    return this.running ?? Promise.resolve();
  }
  private async drain() {
    for (let count = 0; count < 10; count++) {
      const now = this.now();
      const job = await this.repository.claimEmail(
        now.toISOString(),
        this.newId(),
        new Date(now.getTime() + 120_000).toISOString(),
      );
      if (!job) return;
      try {
        await this.deliver(job);
        await this.repository.finishEmail(job, this.now().toISOString(), null);
      } catch {
        this.onFailure(); // Never log an SMTP error's message/body/recipient or credentials.
        const retryAt =
          job.attempts < 5
            ? new Date(this.now().getTime() + 60_000 * 2 ** (job.attempts - 1)).toISOString()
            : null;
        await this.repository.finishEmail(job, this.now().toISOString(), retryAt);
      }
    }
  }
  private async deliver(job: ClaimedEmail) {
    if (job.kind === 'password-reset-notice') {
      await this.delivery.send({
        to: job.account.email,
        subject: 'Your Forma password was reset',
        text: 'Your password was reset and all sessions were signed out. If you did not make this change, request a password reset from the Forma sign-in page immediately.',
      });
      return;
    }
    const purpose = job.kind;
    const createdAt = this.now();
    const token = this.tokens.create(purpose);
    const lifetime = purpose === 'verify-email' ? 24 * 60 * 60 : 30 * 60;
    if (
      !(await this.repository.prepareEmailAction(
        job,
        {
          hash: token.hash,
          userId: job.userId,
          purpose,
          createdAt: createdAt.toISOString(),
          expiresAt: new Date(createdAt.getTime() + lifetime * 1000).toISOString(),
        },
        createdAt.toISOString(),
      ))
    )
      return;
    const url = new URL(
      purpose === 'verify-email' ? '/verify-email' : '/reset-password',
      this.origin,
    );
    // Fragments avoid server/access-log and referrer leakage. The page removes it on load.
    url.hash = new URLSearchParams({ token: token.token }).toString();
    await this.delivery.send({
      to: job.account.email,
      subject: purpose === 'verify-email' ? 'Verify your Forma email' : 'Reset your Forma password',
      text: `${purpose === 'verify-email' ? 'Confirm your email address using the password you chose at registration' : 'Choose a new password'}:\n\n${url.href}\n\nThis link expires in ${purpose === 'verify-email' ? '24 hours' : '30 minutes'} and can be used once. Requesting another email replaces this link. If you did not request this, you can ignore it.`,
    });
  }
}
