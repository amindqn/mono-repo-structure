export interface Account {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  passwordHash: string;
  displayName: string;
  bio: string;
  avatarMediaId: string | null;
  role: 'user' | 'admin';
  createdAt: string;
}
export type PublicAccount = Omit<Account, 'passwordHash'>;
export function publicAccount(account: Account): PublicAccount {
  return {
    id: account.id,
    email: account.email,
    emailVerifiedAt: account.emailVerifiedAt,
    displayName: account.displayName,
    bio: account.bio,
    avatarMediaId: account.avatarMediaId,
    role: account.role,
    createdAt: account.createdAt,
  };
}
export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
}
export interface RefreshCredential {
  hash: string;
  sessionId: string;
  usedAt: string | null;
}
export type RefreshResult =
  { kind: 'ok'; account: Account; session: Session } | { kind: 'invalid' | 'reused' };
