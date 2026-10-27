import type { Account } from '../domain/identity.js';
import { publicAccount } from '../domain/identity.js';
import type { IdentityRepository } from '../domain/identity.repository.js';
import { ApplicationError } from '../../../common/application-error.js';

export class ProfileService {
  constructor(private readonly repository: IdentityRepository) {}
  async update(userId: string, profile: Pick<Account, 'displayName' | 'bio' | 'avatarMediaId'>) {
    const account = await this.repository.updateProfile(userId, profile);
    if (!account)
      throw new ApplicationError(400, 'INVALID_PROFILE', 'Select an image owned by your account');
    return publicAccount(account);
  }
  async sessions(userId: string, currentId: string) {
    return {
      items: (await this.repository.listSessions(userId, new Date().toISOString())).map(
        (session) => ({
          id: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastUsedAt: session.lastUsedAt,
          current: session.id === currentId,
        }),
      ),
    };
  }
  revokeSession(userId: string, sessionId: string) {
    return this.repository.revokeSession(userId, sessionId, new Date().toISOString());
  }
}
