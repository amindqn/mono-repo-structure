# Verification

Verified on **27 October 2026**, using Node **24.11.1**, pnpm **11.15.1**, and macOS.

## Automated checks

| Check                                            | Result                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                 | Passed with strict peer and build-script policies                       |
| `pnpm check`                                     | Passed: formatting, ESLint, boundaries, types, tests, production builds |
| Contract tests                                   | 2 passed                                                                |
| API-client tests                                 | 10 passed                                                               |
| API domain, token, HTTP, SMTP, and startup tests | 27 passed                                                               |
| Next proxy and query-cache tests                 | 9 passed                                                                |
| PostgreSQL integration tests                     | 7 passed; 1 optional S3 case skipped in this update                     |
| `pnpm audit --prod`                              | No known vulnerabilities reported                                       |
| `docker compose config --quiet`                  | Passed                                                                  |
| `git diff --check`                               | Passed                                                                  |

**55 automated tests passed in the email-auth update:** 48 in the normal check, plus
7 PostgreSQL integration cases. The optional S3 case was not rerun in this update;
its earlier local-protocol evidence is retained below.
Integration tests require an explicit disposable `TEST_DATABASE_URL`. The S3 case
additionally requires `TEST_S3_ENDPOINT` and disposable bucket settings; it is skipped
when no object test service is configured.

HTTP and client coverage includes authenticated task/media ownership, rejected actor
impersonation, CSRF/origin checks, session revocation, refresh replay, password changes,
profile validation, upload signatures and limits, multipart handling, cookie/binary
proxy behavior, coordinated refresh, refresh outages, late identity responses, and
query cancellation/cache clearing during account changes.

## Real persistence and object protocol

A temporary **PostgreSQL 17.10** process applied the committed migrations and exercised
the real pg/Drizzle repositories. Checks proved:

- Profiles, sessions, tasks, and database media bytes survived closing and recreating
  the Nest application. Passwords and refresh credentials were stored as hashes.
- Concurrent use of one refresh credential produced one successful rotation and one
  rejection, and committed revocation of the session family before returning the error.
- Two concurrent uploads at 99 files produced one success and one quota rejection,
  leaving exactly 100 files.
- Password change updated the hash and revoked persisted sessions in one transaction.
- Real AWS SDK put/get/delete operations round-tripped bytes through a local S3 protocol
  emulator. A failed metadata/quota write triggered compensating object deletion.

The temporary PostgreSQL binary helper and S3rver emulator were verification tools,
not application dependencies. They were bound to loopback and stopped after use.
This verifies the adapter against the local S3 protocol service, not a cloud provider.

The original architecture checks also challenged the boundary script with temporary
illegal imports: a domain import of Nest and a frontend-to-backend relative import
both failed. Those probes were removed.

## Email-auth update

The new migration was applied to a real temporary PostgreSQL cluster. Concurrent
verification and reset requests each had exactly one successful consumer. Tests also
proved durable outbox delivery after an application restart, expired lease recovery,
stale-worker rejection, password-hash comparison under the verification lock, expired
reset rejection without changing the password, and denial of legacy unverified sessions.

New HTTP/domain cases cover registration without cookies, pending-account login denial,
password-confirmed verification, recovery of an address registered with an unknown
password, generic acknowledgements, purpose binding, expiry, replay, resend cooldowns
and hourly limits, delivery retry, session revocation, reset notification, and cancellation
of outstanding reset links after a signed-in password change.

The real Nodemailer adapter delivered a synthetic message to a loopback SMTP server.
The same adapter rejected sending when TLS was required but unavailable. Local-file
messages were checked for correct contents and mode 0600. No external emails were sent.

The built Next standalone frontend and compiled API ran against temporary PostgreSQL
with automatic local-file email delivery. Browser checks covered registration, opening
the local verification email, explicit confirmation with the account password, login,
forgot-password acknowledgement, reset password confirmation/mismatch handling, reset
success, cross-tab sign-out, and login with the new password. Fragment removal,
no-referrer/noindex metadata, and empty browser storage were checked. Screenshots at
1440 and 375 px were inspected; 320 px had no horizontal overflow, with reduced motion
enabled. Normal checked flows had no console errors or warnings. Service restarts in
the test harness produced expected disconnected requests in the older tab.

An isolated production-dependency API package also initialized and passed queued-email,
password-confirmed verification, login, and recovery-request smoke checks. Its workspace
installation was restored afterward. Docker configuration was validated, but Docker image
builds/startup and the updated remote CI smoke script were not run locally.

New screenshots: `output/playwright/email-verification-desktop.png` and
`output/playwright/reset-password-mobile.png`.

## Earlier foundation browser and compiled runtime

Playwright CLI exercised the built Next standalone server and compiled Nest API,
backed by the temporary PostgreSQL database and object test service:

- Guest session detection, registration, login, logout, and private task creation.
- Uploads through both storage options, authenticated image display, object download,
  and deletion. The downloaded object had the same SHA-256 digest as the upload.
- Display-name/bio editing, owned-avatar selection, and persisted profile reload.
- Deleting the access cookie triggered refresh and restored the signed-in profile.
- Logout in one tab removed private screens in another tab. Switching to a second
  account showed empty task/media lists, without the first account's cached data.
- Password change signed out both tabs; signing in with the new password succeeded.
- HttpOnly/SameSite cookie attributes and narrow paths were inspected without logging
  credential values. `document.cookie`, localStorage, and sessionStorage held no tokens.
- Desktop at 1440 × 1000, account/media layouts at 375 × 900, and media width at 320 px.
  Inspected screenshots showed usable layouts; media had no horizontal overflow at
  either mobile width. Reduced-motion preference was enabled.

Normal guest and authenticated flows produced no browser console errors or warnings.
The deliberate access-cookie removal generated expected 401 resource responses before
refresh succeeded. A browser password-manager hint led to adding the account username
to the password-change form. It does not add a visible field. The updated form was
spot-checked in the browser after that change.

`pnpm --filter @repo/api deploy --prod --legacy` also produced an isolated API package.
Using only its production dependencies, it initialized and completed registration,
authenticated task creation, and a binary database upload/download. The workspace
installation was restored with `pnpm install --frozen-lockfile` afterward.

The initial task-screen verification additionally covered completion/reopening,
filters, blank-title feedback, simulated API outage/recovery, keyboard skip/focus
behavior, reduced motion, and standalone static assets. See the implementation history
for those earlier checks; current auth/media verification is described above.

Local ignored screenshot artifacts are in `output/playwright/`:
`foundation-auth-desktop.png`, `foundation-media-desktop.png`,
`foundation-account-desktop.png`, `foundation-account-mobile.png`, and
`foundation-media-mobile.png`.

## Limits

The Docker daemon was stopped. **Container image builds and Compose startup were not
executed locally.** Compose configuration was validated; compiled applications ran
outside containers. The CI workflow includes container builds, PostgreSQL integration,
and an authenticated full-stack smoke test, but the remote workflow was not run here.

No external email provider, AWS/R2 cloud bucket, or production ingress was provisioned or certified. Production
TLS/cookies, provider permissions, shared rate limits, object reconciliation, backups,
and operational capacity require deployment verification. Memory mode remains disposable;
production and object storage require PostgreSQL. SMTP is verified against a local protocol fixture; real provider credentials and inbox
delivery remain deployment checks. MFA/OAuth and administration are extensions.
