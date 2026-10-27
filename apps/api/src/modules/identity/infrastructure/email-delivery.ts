import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import type { EmailDelivery, EmailMessage } from '../domain/email.ports.js';
import type { Environment } from '../../../config/environment.js';

/** Test capture adapter; deliberately has no HTTP inbox endpoint. */
export class MemoryEmailDelivery implements EmailDelivery {
  readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.messages.push({ ...message });
  }
}
/** Local-only inbox. Files contain secret links and are never served by the application. */
export class FileEmailDelivery implements EmailDelivery {
  constructor(private readonly directory: string) {}
  async send(message: EmailMessage) {
    const directory = resolve(this.directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify(message, null, 2),
      { mode: 0o600, flag: 'wx' },
    );
  }
}
export class SmtpEmailDelivery implements EmailDelivery {
  private readonly transport;
  constructor(env: Environment) {
    this.transport = nodemailer.createTransport(
      {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE === 'true',
        requireTLS: env.SMTP_REQUIRE_TLS === 'true',
        ...(env.SMTP_USER && env.SMTP_PASSWORD
          ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
          : {}),
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
        disableFileAccess: true,
        disableUrlAccess: true,
      },
      { from: env.EMAIL_FROM },
    );
  }
  async send(message: EmailMessage) {
    await this.transport.sendMail(message);
  }
}
