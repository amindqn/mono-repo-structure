import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parseEnvironment } from '../dist/config/environment.js';
import {
  FileEmailDelivery,
  SmtpEmailDelivery,
} from '../dist/modules/identity/infrastructure/email-delivery.js';
it('writes development messages to private files without exposing an HTTP inbox', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forma-mail-'));
  try {
    const message = {
      to: 'local@example.test',
      subject: 'Verify email',
      text: 'A private local-only test link',
    };
    await new FileEmailDelivery(directory).send(message);
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    const path = join(directory, files[0]!);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(message);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(directory, { recursive: true });
  }
});
it('delivers through a real local SMTP socket and refuses plaintext when TLS is required', async () => {
  const delivered: string[] = [];
  const recipients: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setEncoding('utf8');
    socket.write('220 local.example.test ESMTP\r\n');
    let buffer = '';
    let content: string[] | null = null;
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n');
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (content) {
          if (line === '.') {
            delivered.push(content.join('\n'));
            content = null;
            socket.write('250 accepted\r\n');
          } else content.push(line);
          continue;
        }
        if (/^(EHLO|HELO)/i.test(line)) socket.write('250-local.example.test\r\n250 8BITMIME\r\n');
        else if (/^MAIL FROM/i.test(line)) socket.write('250 sender ok\r\n');
        else if (/^RCPT TO/i.test(line)) {
          recipients.push(line);
          socket.write('250 recipient ok\r\n');
        } else if (/^DATA/i.test(line)) {
          content = [];
          socket.write('354 send data\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
        else if (/^STARTTLS/i.test(line)) socket.write('454 TLS unavailable\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test SMTP address');
  const env = parseEnvironment({
    NODE_ENV: 'test',
    MAIL_TRANSPORT: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: address.port,
    SMTP_REQUIRE_TLS: 'false',
    EMAIL_FROM: 'no-reply@example.test',
  });
  try {
    await new SmtpEmailDelivery(env).send({
      to: 'recipient@example.test',
      subject: 'SMTP adapter verification',
      text: 'Synthetic verification message',
    });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain('Synthetic verification message');
    expect(recipients[0]).toContain('recipient@example.test');
    await expect(
      new SmtpEmailDelivery({ ...env, SMTP_REQUIRE_TLS: 'true' }).send({
        to: 'recipient@example.test',
        subject: 'Blocked',
        text: 'Must not be sent',
      }),
    ).rejects.toThrow();
    expect(delivered).toHaveLength(1);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
