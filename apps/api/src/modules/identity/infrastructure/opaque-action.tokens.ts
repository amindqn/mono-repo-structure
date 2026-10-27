import { createHash, randomBytes } from 'node:crypto';
import type { ActionPurpose, ActionTokens } from '../domain/email.ports.js';
export class OpaqueActionTokens implements ActionTokens {
  create(purpose: ActionPurpose) {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token, purpose) };
  }
  hash(token: string, purpose: ActionPurpose) {
    return createHash('sha256').update(`${purpose}:${token}`).digest('hex');
  }
}
