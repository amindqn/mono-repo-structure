import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const origin = 'http://localhost:3000';
const email = `ci-${Date.now()}@example.test`;
const password = 'ci-only-long-password';
async function post(path, body, cookie) {
  return fetch(`${origin}/api/v1/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-protection': '1',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
assert.ok((await fetch(origin)).ok);
assert.ok((await fetch(`${origin}/api/v1/health/ready`)).ok);
assert.equal(
  (await post('auth/register', { email, password, displayName: 'CI Account' })).status,
  202,
);
let token;
for (let attempt = 0; attempt < 30 && !token; attempt++) {
  // Capture the private inbox through stdout without printing its secret contents in CI.
  const raw = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'api',
      'node',
      '--input-type=module',
      '-e',
      `import {readdirSync,readFileSync} from 'node:fs'; const p='output/mail'; console.log(JSON.stringify(readdirSync(p).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(readFileSync(p+'/'+n,'utf8')))));`,
    ],
    { encoding: 'utf8' },
  );
  const message = JSON.parse(raw).find(
    (message) => message.to === email && message.subject === 'Verify your Forma email',
  );
  const link = message?.text.match(/https?:\/\/[^\s]+/)?.[0];
  if (link) token = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
  else await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(token, 'Expected a local verification email');
assert.equal((await post('auth/verify-email', { token, password })).status, 204);
const login = await post('auth/login', { email, password });
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
assert.equal((await post('tasks', { title: 'Verified container smoke test' }, cookie)).status, 201);
console.log('Deployed web, email verification, login, and owned task smoke checks passed.');
