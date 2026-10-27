import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../.env', import.meta.url));
const original = existsSync(path) ? readFileSync(path, 'utf8') : '';
if (/^JWT_ACCESS_SECRET=.+$/m.test(original)) {
  console.log('Compose signing secret is already configured; existing values were preserved.');
} else {
  const line = `JWT_ACCESS_SECRET=${randomBytes(48).toString('base64url')}`;
  const updated = /^JWT_ACCESS_SECRET=$/m.test(original)
    ? original.replace(/^JWT_ACCESS_SECRET=$/m, line)
    : `${original}${original.endsWith('\n') || !original ? '' : '\n'}${line}\n`;
  writeFileSync(path, updated, { mode: 0o600 });
  console.log('Created a private local Compose signing secret in .env.');
}
