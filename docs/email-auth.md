# Email verification and password recovery

## Behavior

Registration returns **202** with a generic email acknowledgement and creates no
session. A new account is pending until its email is verified. Login with the correct
password on a pending account returns `EMAIL_NOT_VERIFIED`; incorrect credentials
retain the generic login error. Session creation, refresh, and protected requests
all enforce persisted verification status.

The migration adds `email_verified_at` as nullable. **Existing accounts are not silently
marked verified.** Existing sessions for pending accounts cannot access private data.
Users can request verification from the sign-in page and sign in after confirming with their account password.

- `/resend-verification` requests a new verification link for a pending account.
- `/verify-email` asks for the account password and explicit confirmation. A GET or email scanner cannot
  consume a link. Successful verification does not sign the user in.
- `/forgot-password` requests a reset for an existing verified or pending account. A pending account
  still needs email verification after replacing its password.
- `/reset-password` asks for a new password and confirmation. Successful reset changes
  the password, consumes all reset credentials, cancels outstanding reset emails,
  revokes every session, and queues a notification in one database transaction.
  The user then signs in normally. The notification contains no password or token.
- Changing a password while signed in also invalidates outstanding reset credentials
  and cancels queued reset-link messages.

Registration (including duplicates), resend, and forgot-password all acknowledge with:
`If this address is eligible, an email will arrive shortly.` They return no token,
account identifier, or session. A duplicate registration never changes an existing
password or profile and does not resend an unsolicited email.

## Tokens and privacy

Action credentials are random 256-bit opaque values. Only SHA-256 digests, bound to
`verify-email` or `reset-password`, are stored. Access JWTs, refresh credentials, and
email actions cannot substitute for one another. Verification lasts **24 hours**;
reset lasts **30 minutes**, starting at delivery preparation. New delivery attempts
replace earlier credentials for the same account/purpose. Only the newest link works.

Verification additionally requires the current account password. This prevents an
email owner from activating a password chosen by someone who reserved their address.
If the owner does not know that password, recovery replaces it without marking the
email verified; the owner can then verify using the new password. A password change
between checking the password and committing verification causes the attempt to fail.

Consumption is single use and is serialized on the account row in PostgreSQL. Expiry,
purpose, and existence are checked again under the lock before changing state. A
reset validates a token before running the password KDF and rechecks it afterward.
Concurrent reset attempts have exactly one winner, including session revocation and
notification creation. Failed or expired tokens do not change the password.

Links use the configured `EMAIL_WEB_ORIGIN`, never a request Host or redirect parameter.
Tokens are in the URL **fragment**, so they are absent from HTTP request URLs, server
access logs, and referrers. The client removes the fragment on load and keeps it only
in a component ref until submission. No browser storage or query cache persists it.
Verification/reset pages additionally set `no-referrer` and `noindex` metadata. Reloading
a page after the fragment has been removed requires opening the original email link
again. The UI never consumes a token automatically on page load.

All mutation endpoints retain strict contracts, the custom CSRF header, and origin
checks. Public action routes have dedicated rate limits. Resend/reset email requests
are limited per account/purpose to one per minute and five per hour under the account
row lock. Suppression has the same public acknowledgement. SMTP runs asynchronously,
so mailbox existence and transport latency are not exposed through an SMTP-dependent
HTTP response. Network timing is not claimed to be perfectly constant.

## Outbox and adapters

`EmailActionsService` depends on the email repository and crypto/password ports.
`EmailProcessor` composes those ports with an `EmailDelivery` adapter. The concrete
adapters are local file, test capture, and Nodemailer SMTP; domain/application code
has no Nest, Nodemailer, or database imports.

PostgreSQL stores jobs transactionally with registration/reset. The worker polls once
per second, leases jobs with `FOR UPDATE SKIP LOCKED`, and uses an attempt ID to reject
stale workers. Expired leases can be reclaimed after a crash. Each process drains at
most ten jobs per poll, without overlapping its own batches. Shutdown stops polling
and waits for the active batch before the database closes.

**Raw action tokens and message bodies are not persisted in the outbox.** Each delivery
attempt generates a token in memory, persists its digest, and sends the message outside
the database transaction. Failed delivery retries after 1, 2, 4, and 8 minutes, with a
maximum of five normal attempts. Workers emit only a generic failure log; SMTP error
objects, recipients, passwords, and message bodies are not logged.

Delivery is at least once. A crash after provider acceptance but before recording
completion can produce another message with a replacement link. Email ordering is
not guaranteed; use the most recent link. Provider delivery, spam filtering, and inbox
arrival cannot be guaranteed by SMTP acceptance. Operations should monitor failures,
configure retention for completed jobs/expired credentials, and provide support when
attempts are exhausted. No external queue or cron service is required for the starter.

Memory demo persistence has the same behavior while the process runs; its outbox and
accounts are disposable. Durable operation requires PostgreSQL.

## Local inbox

No external email is sent by the default development configuration. Run `pnpm dev`,
register in the UI, then read the newest JSON message in **apps/api/output/mail/**.
Copy its complete link into the browser. Files are mode 0600 and the created inbox
directory is mode 0700. The application has no public inbox endpoint. These files
contain secret links; do not publish or commit them. `output/` is ignored by Git.

```dotenv
MAIL_TRANSPORT=file
MAIL_OUTPUT_DIR=output/mail
EMAIL_FROM=no-reply@example.test
EMAIL_WEB_ORIGIN=http://localhost:3000
```

The local Compose API uses `/app/output/mail` backed by the `mail_data` volume:

```sh
docker compose cp api:/app/output/mail ./output/compose-mail
```

## SMTP deployment

Production refuses local-file/test delivery, an HTTP email origin, or plaintext SMTP.
Supply these API runtime settings along with the existing production database,
signing-key, cookie, and trusted-origin settings:

```dotenv
NODE_ENV=production
MAIL_TRANSPORT=smtp
EMAIL_FROM=security@your-verified-domain.example
EMAIL_WEB_ORIGIN=https://app.example.com
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=<provider-user>
SMTP_PASSWORD=<provider-secret>
```

Port 587 uses mandatory STARTTLS. For implicit TLS, use port 465 and
`SMTP_SECURE=true`. Certificate validation remains enabled. Auth can be omitted for
an explicitly configured trusted relay; partial username/password pairs are rejected.
A local SMTP catcher may use `SMTP_REQUIRE_TLS=false` outside production only.
Credentials are scoped to API runtime tasks and never enter the Next client bundle.
SMTP connection, greeting, and socket timeouts are bounded. File/URL attachment access
is disabled, and messages use fixed plain-text templates.

Set up a verified sender, SPF/DKIM/DMARC, provider credentials, and operational alerts
with your provider. This repository does not provision a provider or send live emails
without your SMTP configuration.

## HTTP endpoints

All are public POST routes under `/api/v1/auth`, with strict JSON and the CSRF header.

| Path                   | Input                        | Success                            |
| ---------------------- | ---------------------------- | ---------------------------------- |
| `/register`            | email, password, displayName | 202 generic acknowledgement        |
| `/resend-verification` | email                        | 202 generic acknowledgement        |
| `/forgot-password`     | email                        | 202 generic acknowledgement        |
| `/verify-email`        | token                        | 204; no session                    |
| `/reset-password`      | token, newPassword           | 204; clear cookies, no new session |

The shared API client validates each input/response and never attempts session refresh
for these public action calls. Password confirmation is a UI check; the API applies
the same password policy and scrypt KDF as registration and signed-in password changes.

## Sources

- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html):
  generic acknowledgements, random single-use expiring credentials, configured trusted
  link origins, password confirmation, session invalidation, and reset notifications.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html):
  account verification, generic failures, and abuse controls.
- [Nodemailer SMTP transport](https://nodemailer.com/smtp): mandatory STARTTLS, implicit
  TLS, timeouts, credentials, and restricted content sources.
