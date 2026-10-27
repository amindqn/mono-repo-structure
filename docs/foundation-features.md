# Foundation features

Implemented on 27 October 2026 for the Next.js/NestJS starter. These are working
application features with memory and PostgreSQL adapters, not empty module folders.

## Identity and access

- Register, verify email, sign in, sign out, inspect the current profile, and list/revoke sessions.
- Verification and forgot/reset-password flows use purpose-bound single-use tokens and
  a transactional email outbox. See [email auth](email-auth.md) for setup and details.
- Short-lived signed access JWTs (15 minutes by default) and opaque 256-bit refresh
  credentials (7-day absolute sessions by default, configurable up to 30 days).
- Both credentials use HttpOnly, SameSite=Lax cookies. Production requires Secure
  cookies and an explicitly provided private signing secret. Tokens are never placed
  in localStorage, sessionStorage, React state, query data, URLs, or JSON auth responses.
- Only SHA-256 digests of random refresh credentials are stored. Passwords use a
  separate salted scrypt KDF with N=131072, r=8, p=1, and 64-byte derived keys.
- Every refresh consumes its predecessor. PostgreSQL locks the session row and
  atomically marks the old digest used and inserts its replacement. Reusing a consumed
  credential commits revocation of that session family before returning 401.
- Access JWT verification pins HS256, issuer, audience, required claims, and expiry.
  Protected requests also check the persisted session. Logout and revocation therefore
  take effect immediately rather than waiting for access-token expiry.
- Password changes verify the current password, update the hash, and revoke all sessions
  in one database transaction. The current browser signs out and must use the new password.
- Login errors do not distinguish unknown emails from incorrect passwords. Both paths
  perform the password KDF. Registration and login have separate route rate limits.
- Guests can check whether their browser presented session cookies through a public
  presence endpoint. The endpoint does not reveal credentials or treat their presence
  as proof of authentication; protected identity lookup still validates the session.

AuthService, ProfileService, repository ports, PasswordHasher, and TokenService separate
application behavior from Nest, PostgreSQL, crypto libraries, and cookie handling.
The access signing key is ephemeral in development if omitted. Keep it stable for
persistent development sessions; production refuses to start without an explicit key.

## CSRF and the Next boundary

Unsafe requests require `x-csrf-protection: 1`. This is a custom-header/preflight defense,
not a secret CSRF token. The Next proxy additionally checks the caller's Origin against
its browser-facing host or configured APP_ORIGIN. Nest independently checks any supplied
Origin against TRUSTED_ORIGINS. CORS is not enabled by default. Non-browser clients may
omit Origin but must still provide the custom header and valid credentials.

Set these for an HTTPS deployment behind an ingress, together with the required
[SMTP settings](email-auth.md#smtp-deployment):

```dotenv
# API environment
NODE_ENV=production
PERSISTENCE=postgres
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=<private-random-value-of-at-least-32-characters>
COOKIE_SECURE=true
TRUSTED_ORIGINS=https://app.example.com

# Web environment; both are server-only runtime settings
API_ORIGIN=http://api:4000
APP_ORIGIN=https://app.example.com
```

The access cookie has Path=/api/v1; the refresh cookie is narrower at /api/v1/auth.
The proxy forwards only these known session cookies, preserves multiple Set-Cookie
headers separately, and forwards Authorization when explicitly supplied. It rejects
unlisted routes/methods, preserves binary request bodies, limits upload/JSON sizes,
disables private HTTP caching, and never accepts an upstream URL from a caller.
Runtime secret variables are scoped to API tasks in Turbo; the web task receives its
origin settings rather than the API's signing key or object-store credentials.

## Profiles and authorization

The profile contains an immutable sign-in email, display name, bio, role, and optional
avatar media ID. Profile updates allow only display name, bio, and avatar selection.
Role/email/password assignment through the profile payload is rejected.

Task and media repositories filter by the authenticated account ID supplied by the
guard. An account ID in a body cannot impersonate another user. Access to another
account's task or file behaves like a missing resource. Only owned image uploads can
be selected as avatars, and deleting an avatar file clears that profile reference.

The role field is a starting point for future authorization policies; this starter does
not expose role-management or administration routes. Existing starter tasks without an
owner are retained by the migration and excluded from authenticated lists. No existing
row is silently assigned to a newly registered account.

## Media storage

| Mode                   | File bytes                        | Ownership and metadata             |
| ---------------------- | --------------------------------- | ---------------------------------- |
| Database + PostgreSQL  | PostgreSQL bytea in the media row | Same transactional row             |
| Database + memory demo | Process memory                    | Process memory; lost at restart    |
| Object storage         | Private S3-compatible bucket      | PostgreSQL; required for this mode |

Uploads accept one JPEG, PNG, WebP, or PDF, up to 5 MiB. Server-side file-signature
inspection checks the actual bytes against the claimed type. SVG/HTML uploads are
not accepted. Filenames are sanitized; object keys use account/asset UUIDs rather than
client filenames. Per-account limits are 100 files and 100 MiB, enforced under a user-row
lock in PostgreSQL so concurrent requests cannot bypass the quota.

Images can be displayed through an authenticated content route. PDFs are served as
attachments. Responses use nosniff, private/no-store, content disposition, and a sandbox
content policy. The browser receives no bucket credentials or public object URLs.
Object upload failure before metadata persistence compensates by deleting the object.
A database file's bytes and metadata are persisted atomically.

Configure a pre-created, private bucket in apps/api/.env:

```dotenv
PERSISTENCE=postgres
DATABASE_URL=postgresql://app:local-development-only@127.0.0.1:5432/web_platform
S3_BUCKET=private-workspace-media
S3_REGION=us-east-1
# Optional: omit for AWS S3, set your provider endpoint for other S3-compatible stores.
S3_ENDPOINT=https://your-provider.example
S3_ACCESS_KEY_ID=<server-only-key>
S3_SECRET_ACCESS_KEY=<server-only-secret>
```

With AWS, explicit keys can be omitted to use the SDK's default credential chain.
For R2, use the account's S3 endpoint and the provider's required region (commonly auto).
Use a bucket policy/IAM identity restricted to the application's private object prefix
and required put/get/delete operations. The application does not provision cloud resources.
The media screen enables the object-storage option when a bucket is configured.

A process crash between an object write and metadata commit can still leave an orphan.
Production object stores need an orphan reconciliation/retention policy. Database backups,
bucket encryption, provider permissions, malware scanning, and larger-file processing are
operational/product extensions, not claims made by signature validation.

## React Query and refresh coordination

`src/lib/query-client.ts` centralizes 30-second stale time, 10-minute inactive retention,
refetch on focus/reconnect, bounded backoff for transient query failures, no retries for
4xx query errors, and no automatic mutation retries. Private keys include the account ID.
Session lookup has its own freshness/polling policy; media configuration is less volatile.

On a 401, the API client coordinates one refresh per instance, acquires a browser Web Lock
when available, rechecks whether another tab already refreshed, and retries once. A refresh
server outage remains an error rather than a forced logout. Browsers without Web Locks have
single-instance coordination; simultaneous refreshes in multiple tabs can require signing
in again because replay protection remains strict.

Session changes cancel queries, remove private data and mutation cache entries, and update
the observed session query. A generation check discards late responses and prevents retries
from an earlier account from running under a newly signed-in account. BroadcastChannel
propagates session changes between tabs. Query caches are not persisted to browser storage.

## API summary

All paths below are under /api/v1. Unsafe requests need the CSRF header. Cookie auth is
required except for registration/login/refresh/logout, email verification/recovery,
session-presence, and health endpoints.

| Method   | Path                                   | Behavior                                               |
| -------- | -------------------------------------- | ------------------------------------------------------ |
| GET      | /auth/session                          | Check cookie presence; no authentication assertion     |
| POST     | /auth/register                         | Create pending account and queue verification email    |
| POST     | /auth/login                            | Create session                                         |
| GET      | /auth/me                               | Read the authenticated profile                         |
| POST     | /auth/refresh                          | Rotate refresh credential and access cookie            |
| POST     | /auth/logout                           | Revoke the presented refresh session and clear cookies |
| POST     | /auth/password                         | Change password, revoke all sessions, clear cookies    |
| GET      | /auth/sessions                         | List active owned sessions, including a current marker |
| DELETE   | /auth/sessions/:id                     | Revoke an owned session                                |
| PATCH    | /users/me                              | Edit profile and select an owned image                 |
| GET/POST | /tasks                                 | List/create owned tasks                                |
| PATCH    | /tasks/:id                             | Update an owned task                                   |
| GET      | /media/config                          | Read configured providers and upload limits            |
| GET      | /media                                 | List owned file metadata                               |
| POST     | /media/upload?storage=database\|object | Upload one multipart file field                        |
| GET      | /media/:id/content                     | Read an owned file                                     |
| DELETE   | /media/:id                             | Delete an owned file and avatar references             |

## Deployment and extension limits

This is a working foundation, not an identity-provider replacement. MFA/passkeys, OAuth providers, account deletion, and administration need explicit
product policies and (where relevant) provider configuration.
Registration requires email confirmation before creating a session. Development writes private local email files; production requires SMTP.

The in-process limiter is a conservative baseline. A Next proxy is one upstream client
from Nest's perspective; production should apply rate policies at a trusted ingress and/or
by authenticated account, with a shared store across replicas. Configure trusted proxy
chains explicitly before relying on forwarded addresses. Expired session/credential rows
also need a deployment-specific retention/cleanup policy at scale. Database health checks
verify the migrated schema; they do not certify an external object provider's availability.

## Research references

- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html):
  selected scrypt parameters and a per-password random salt.
- [RFC 9700, refresh replay protection](https://www.rfc-editor.org/info/rfc9700/):
  applied rotation and session-family replay detection. This app is not an OAuth server.
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html):
  custom request headers plus Origin checks and SameSite cookies.
- [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html):
  allowlisted types, signature checks, size limits, private storage, and authenticated retrieval.
- [Fastify multipart](https://github.com/fastify/fastify-multipart): manually registered
  for the pinned Nest 11 adapter, with a bounded parts iterator. Newer Nest 12 upload
  interceptor documentation is not assumed to apply to Nest 11.
- [AWS SDK v3 S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html):
  put/get/delete adapter and server-side credentials.
- [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults):
  explicit freshness, retries, invalidation, and cancellation policies.
