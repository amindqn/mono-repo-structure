import { and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/connection.js';
import {
  media,
  actionCredentials,
  emailOutbox,
  refreshCredentials,
  sessions,
  users,
} from '../../../infrastructure/database/schema.js';
import type { Account, RefreshCredential, RefreshResult, Session } from '../domain/identity.js';
import type {
  ActionCredential,
  ActionPurpose,
  ClaimedEmail,
  EmailJob,
} from '../domain/email.ports.js';
import type { IdentityRepository } from '../domain/identity.repository.js';

const accountFrom = (row: typeof users.$inferSelect): Account => ({
  ...row,
  emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});
const sessionFrom = (row: typeof sessions.$inferSelect): Session => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  lastUsedAt: row.lastUsedAt.toISOString(),
  revokedAt: row.revokedAt?.toISOString() ?? null,
});
const sessionValues = (session: Session) => ({
  ...session,
  createdAt: new Date(session.createdAt),
  expiresAt: new Date(session.expiresAt),
  lastUsedAt: new Date(session.lastUsedAt),
  revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
});

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly db: Database) {}
  async findByEmail(email: string) {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? accountFrom(row) : null;
  }
  async findById(id: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? accountFrom(row) : null;
  }
  async register(account: Account, emailJob: EmailJob) {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        .values({ ...account, emailVerifiedAt: null, createdAt: new Date(account.createdAt) })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (!inserted.length) return false;
      await tx.insert(emailOutbox).values(jobValues(emailJob));
      return true;
    });
  }
  async createSession(
    accountId: string,
    verifiedPasswordHash: string,
    session: Session,
    refresh: RefreshCredential,
  ) {
    return this.db.transaction(async (tx) => {
      const [account] = await tx.select().from(users).where(eq(users.id, accountId)).for('update');
      if (!account?.emailVerifiedAt || account.passwordHash !== verifiedPasswordHash) return false;
      await tx.insert(sessions).values(sessionValues(session));
      await tx.insert(refreshCredentials).values({ ...refresh, usedAt: null });
      return true;
    });
  }
  async rotateRefresh(hash: string, nextHash: string, now: string): Promise<RefreshResult> {
    const [hint] = await this.db
      .select({ sessionId: refreshCredentials.sessionId })
      .from(refreshCredentials)
      .where(eq(refreshCredentials.hash, hash))
      .limit(1);
    if (!hint) return { kind: 'invalid' };
    return this.db.transaction(async (tx): Promise<RefreshResult> => {
      // Serialize every rotation/revocation within a token family on its session row.
      const [session] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, hint.sessionId))
        .for('update');
      if (!session || session.revokedAt || session.expiresAt <= new Date(now))
        return { kind: 'invalid' };
      const [credential] = await tx
        .select()
        .from(refreshCredentials)
        .where(eq(refreshCredentials.hash, hash));
      if (!credential) return { kind: 'invalid' };
      if (credential.usedAt) {
        await tx
          .update(sessions)
          .set({ revokedAt: new Date(now) })
          .where(eq(sessions.id, session.id));
        // Return rather than throw: replay revocation must COMMIT before presentation sends 401.
        return { kind: 'reused' };
      }
      const [account] = await tx.select().from(users).where(eq(users.id, session.userId));
      if (!account?.emailVerifiedAt) return { kind: 'invalid' };
      await tx
        .update(refreshCredentials)
        .set({ usedAt: new Date(now) })
        .where(eq(refreshCredentials.hash, hash));
      await tx
        .insert(refreshCredentials)
        .values({ hash: nextHash, sessionId: session.id, usedAt: null });
      await tx
        .update(sessions)
        .set({ lastUsedAt: new Date(now) })
        .where(eq(sessions.id, session.id));
      return {
        kind: 'ok',
        account: accountFrom(account),
        session: sessionFrom({ ...session, lastUsedAt: new Date(now) }),
      };
    });
  }
  async revokeByRefresh(hash: string, now: string) {
    const [credential] = await this.db
      .select()
      .from(refreshCredentials)
      .where(eq(refreshCredentials.hash, hash))
      .limit(1);
    if (credential)
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date(now) })
        .where(eq(sessions.id, credential.sessionId));
  }
  async revokeSession(userId: string, sessionId: string, now: string) {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(now) })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  }
  async activeAccount(userId: string, sessionId: string, now: string) {
    const [row] = await this.db
      .select({ account: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          isNotNull(users.emailVerifiedAt),
          gt(sessions.expiresAt, new Date(now)),
        ),
      )
      .limit(1);
    return row ? accountFrom(row.account) : null;
  }
  async listSessions(userId: string, now: string) {
    return (
      await this.db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date(now)),
          ),
        )
        .orderBy(desc(sessions.createdAt))
        .limit(50)
    ).map(sessionFrom);
  }
  async updateProfile(id: string, profile: Pick<Account, 'displayName' | 'bio' | 'avatarMediaId'>) {
    const avatarAllowed =
      profile.avatarMediaId === null
        ? sql`true`
        : sql`exists (select 1 from ${media} where ${media.id} = ${profile.avatarMediaId} and ${media.ownerId} = ${id} and ${media.contentType} like 'image/%')`;
    const [row] = await this.db
      .update(users)
      .set(profile)
      .where(and(eq(users.id, id), avatarAllowed))
      .returning();
    return row ? accountFrom(row) : null;
  }
  async changePassword(id: string, previousHash: string, nextHash: string, now: string) {
    return this.db.transaction(async (tx) => {
      const [account] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!account || account.passwordHash !== previousHash) return false;
      await cancelActions(tx, id, 'reset-password', now);
      await tx.update(users).set({ passwordHash: nextHash }).where(eq(users.id, id));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(now) })
        .where(eq(sessions.userId, id));
      return true;
    });
  }
  async queueEmail(email: string, job: EmailJob) {
    await this.db.transaction(async (tx) => {
      const [account] = await tx.select().from(users).where(eq(users.email, email)).for('update');
      if (!account || (job.kind === 'verify-email' && account.emailVerifiedAt)) return;
      const recent = await tx
        .select({ createdAt: emailOutbox.createdAt })
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.userId, account.id),
            eq(emailOutbox.kind, job.kind),
            gt(emailOutbox.createdAt, new Date(Date.parse(job.createdAt) - 3_600_000)),
          ),
        );
      if (
        recent.length >= 5 ||
        recent.some((value) => value.createdAt.getTime() > Date.parse(job.createdAt) - 60_000)
      )
        return;
      await tx.insert(emailOutbox).values(jobValues({ ...job, userId: account.id }));
    });
  }
  async claimEmail(now: string, leaseId: string, leaseUntil: string): Promise<ClaimedEmail | null> {
    return this.db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(emailOutbox)
        .where(
          and(
            isNull(emailOutbox.finishedAt),
            lte(emailOutbox.availableAt, new Date(now)),
            or(isNull(emailOutbox.leaseUntil), lte(emailOutbox.leaseUntil, new Date(now))),
          ),
        )
        .orderBy(emailOutbox.availableAt)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!job) return null;
      const [account] = await tx.select().from(users).where(eq(users.id, job.userId));
      if (!account) return null;
      await tx
        .update(emailOutbox)
        .set({ leaseId, leaseUntil: new Date(leaseUntil), attempts: job.attempts + 1 })
        .where(eq(emailOutbox.id, job.id));
      return {
        ...job,
        createdAt: job.createdAt.toISOString(),
        availableAt: job.availableAt.toISOString(),
        finishedAt: null,
        leaseId,
        leaseUntil,
        attempts: job.attempts + 1,
        account: accountFrom(account),
      };
    });
  }
  async prepareEmailAction(job: ClaimedEmail, credential: ActionCredential, now: string) {
    return this.db.transaction(async (tx) => {
      const [account] = await tx.select().from(users).where(eq(users.id, job.userId)).for('update');
      const [stored] = await tx
        .select()
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.id, job.id),
            eq(emailOutbox.leaseId, job.leaseId),
            isNull(emailOutbox.finishedAt),
            gt(emailOutbox.leaseUntil, new Date(now)),
          ),
        );
      if (!stored || !account || (job.kind === 'verify-email' && account.emailVerifiedAt))
        return false;
      await tx
        .delete(actionCredentials)
        .where(
          and(
            eq(actionCredentials.userId, job.userId),
            eq(actionCredentials.purpose, credential.purpose),
          ),
        );
      await tx.insert(actionCredentials).values({
        ...credential,
        createdAt: new Date(credential.createdAt),
        expiresAt: new Date(credential.expiresAt),
      });
      return true;
    });
  }
  async finishEmail(job: ClaimedEmail, now: string, retryAt: string | null) {
    await this.db
      .update(emailOutbox)
      .set({
        leaseId: null,
        leaseUntil: null,
        ...(retryAt ? { availableAt: new Date(retryAt) } : { finishedAt: new Date(now) }),
      })
      .where(
        and(
          eq(emailOutbox.id, job.id),
          eq(emailOutbox.leaseId, job.leaseId),
          isNull(emailOutbox.finishedAt),
        ),
      );
  }
  async actionExists(hash: string, purpose: ActionPurpose, now: string) {
    const [action] = await this.db
      .select({ hash: actionCredentials.hash })
      .from(actionCredentials)
      .where(
        and(
          eq(actionCredentials.hash, hash),
          eq(actionCredentials.purpose, purpose),
          gt(actionCredentials.expiresAt, new Date(now)),
        ),
      )
      .limit(1);
    return Boolean(action);
  }
  async verificationAccount(hash: string, now: string) {
    const [row] = await this.db
      .select({ account: users })
      .from(actionCredentials)
      .innerJoin(users, eq(users.id, actionCredentials.userId))
      .where(
        and(
          eq(actionCredentials.hash, hash),
          eq(actionCredentials.purpose, 'verify-email'),
          gt(actionCredentials.expiresAt, new Date(now)),
          isNull(users.emailVerifiedAt),
        ),
      )
      .limit(1);
    return row ? accountFrom(row.account) : null;
  }
  async verifyEmail(hash: string, passwordHash: string, now: string) {
    const [hint] = await this.db
      .select({ userId: actionCredentials.userId })
      .from(actionCredentials)
      .where(eq(actionCredentials.hash, hash));
    if (!hint) return false;
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(users)
        .where(eq(users.id, hint.userId))
        .for('update');
      const [action] = await tx
        .select()
        .from(actionCredentials)
        .where(
          and(
            eq(actionCredentials.hash, hash),
            eq(actionCredentials.purpose, 'verify-email'),
            gt(actionCredentials.expiresAt, new Date(now)),
          ),
        );
      if (!action || !account || account.emailVerifiedAt || account.passwordHash !== passwordHash)
        return false;
      await tx
        .update(users)
        .set({ emailVerifiedAt: new Date(now) })
        .where(eq(users.id, account.id));
      await cancelActions(tx, account.id, 'verify-email', now);
      return true;
    });
  }
  async resetPassword(hash: string, nextHash: string, now: string, notice: EmailJob) {
    const [hint] = await this.db
      .select({ userId: actionCredentials.userId })
      .from(actionCredentials)
      .where(eq(actionCredentials.hash, hash));
    if (!hint) return false;
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(users)
        .where(eq(users.id, hint.userId))
        .for('update');
      const [action] = await tx
        .select()
        .from(actionCredentials)
        .where(
          and(
            eq(actionCredentials.hash, hash),
            eq(actionCredentials.purpose, 'reset-password'),
            gt(actionCredentials.expiresAt, new Date(now)),
          ),
        );
      if (!action || !account) return false;
      await tx.update(users).set({ passwordHash: nextHash }).where(eq(users.id, account.id));
      await cancelActions(tx, account.id, 'reset-password', now);
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(now) })
        .where(eq(sessions.userId, account.id));
      await tx.insert(emailOutbox).values(jobValues({ ...notice, userId: account.id }));
      return true;
    });
  }
}

const jobValues = (job: EmailJob) => ({
  ...job,
  createdAt: new Date(job.createdAt),
  availableAt: new Date(job.availableAt),
  leaseUntil: job.leaseUntil ? new Date(job.leaseUntil) : null,
  finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
});
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
async function cancelActions(tx: Transaction, userId: string, purpose: ActionPurpose, now: string) {
  await tx
    .delete(actionCredentials)
    .where(and(eq(actionCredentials.userId, userId), eq(actionCredentials.purpose, purpose)));
  await tx
    .update(emailOutbox)
    .set({ finishedAt: new Date(now) })
    .where(
      and(
        eq(emailOutbox.userId, userId),
        eq(emailOutbox.kind, purpose),
        isNull(emailOutbox.finishedAt),
      ),
    );
}
