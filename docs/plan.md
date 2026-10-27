# Implementation and verification plan

- [x] Inspect the destination, research alternatives, and record sources and stack decisions.
- [x] Create workspace tooling and enforce package/layer boundaries.
- [x] Implement a Nest feature with contracts, persistence adapters, migrations, and API docs.
- [x] Implement the Next frontend and runtime API proxy.
- [x] Add operational documentation, containers, and CI.
- [x] Install dependencies; verify formatting, lint, types, tests, production builds, and live UI flows.

Checks are marked complete only after evidence is recorded in `docs/verification.md`.

## Foundation features

- [x] Add registration/login, secure access cookies, rotating refresh sessions, revocation, and password changes.
- [x] Add profile editing and authenticated task/media ownership.
- [x] Add validated media uploads, database bytes, and an S3-compatible object adapter.
- [x] Configure user-scoped query keys, retries, invalidation, refresh coordination, and logout cache clearing.
- [x] Add usable auth/account/media screens while preserving the existing visual system.
- [x] Verify authorization failures, refresh replay, uploads, PostgreSQL transactions, browser flows, builds, and documentation.

## Email verification and recovery

- [x] Add purpose-bound, hashed, expiring action credentials and atomic consumption.
- [x] Require verified email for sessions and add a durable, retryable email outbox.
- [x] Add local-file/test/SMTP delivery adapters and validated production settings.
- [x] Add registration confirmation, resend, forgot-password, verification, and reset screens.
- [x] Verify replay, expiry, concurrency, delivery failures, session revocation, browser flows, and documentation.
