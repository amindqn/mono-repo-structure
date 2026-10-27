export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encoded: string | null): Promise<boolean>;
}
export interface AccessIdentity {
  userId: string;
  sessionId: string;
  expiresAt: number;
}
export interface TokenService {
  createAccess(userId: string, sessionId: string): Promise<{ token: string; expiresAt: string }>;
  verifyAccess(token: string): Promise<AccessIdentity>;
  createRefresh(): { token: string; hash: string };
  hashRefresh(token: string): string;
}
