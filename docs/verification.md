# Verification

Verified on **27 October 2026**, using Node **24.11.1**, pnpm **11.15.1**, and macOS.

## Automated checks

| Check                               | Result                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`    | Passed with strict peer and build-script policies                       |
| `pnpm check`                        | Passed: formatting, ESLint, boundaries, types, tests, production builds |
| Contract tests                      | 2 passed                                                                |
| API-client tests                    | 4 passed                                                                |
| Domain/use-case tests               | 3 passed                                                                |
| Initialized Nest HTTP/startup tests | 5 passed                                                                |
| Next proxy tests                    | 3 passed                                                                |
| PostgreSQL integration tests        | 2 passed against a temporary PostgreSQL 17.10 cluster                   |
| `pnpm audit --prod`                 | No known vulnerabilities reported after dependency fixes                |
| `docker compose config --quiet`     | Passed                                                                  |
| `git diff --check`                  | Passed                                                                  |

**19 automated tests passed.** PostgreSQL integration is separate from the normal
test command and requires `TEST_DATABASE_URL` when run by a developer or CI.

The PostgreSQL check applied the generated SQL migration, exercised the real pg
driver and Drizzle repository, verified a database constraint, updated statuses,
and proved that an HTTP-created task survived closing and recreating the Nest app.
The temporary cluster was bound to loopback and stopped afterward. It was a real
PostgreSQL process, not a mocked repository or an in-memory SQL substitute. The
temporary binary helper was used only for verification and is not a project dependency.

Architecture enforcement was also challenged with temporary illegal imports. A
domain import of Nest and a relative frontend-to-backend import both failed with
the expected boundary errors. The probes and their emitted artifacts were removed.

## Packaged runtime checks

`pnpm --filter @repo/api deploy --prod --legacy` produced an isolated API package.
The packaged application initialized and completed a task-creation HTTP request
using only its production dependencies, with the memory adapter in test mode.

The generated Next standalone server started with `pnpm --filter @repo/web start`.
Its HTML, **12 referenced static assets**, generated SVG icon, and runtime API proxy
all returned successful responses. The web build explicitly copies static assets
into standalone output. A fresh browser session against this production frontend
reported **zero console errors and warnings**.

## Browser verification

Playwright CLI exercised the running applications:

- Empty state, task creation, completion, reopening, and status filters.
- Blank-title validation and inline error feedback.
- A simulated API outage, the error state, and recovery through **Try again**.
- Desktop at 1440 × 1000 and mobile at 375 × 900, with rendered screenshots inspected.
- Mobile document width of 375 px at a 375 px viewport: no horizontal overflow.
- Reduced-motion preference enabled and a 16 px mobile input font.
- Keyboard Tab to the visible skip link, a 3 px focus ring, and Enter moving focus
  to the main task content.
- Task creation against the production Next standalone frontend.

Screenshots are local, ignored artifacts in `output/playwright/`:
`production-desktop.png` and `production-mobile.png`. The earlier development
session's initial missing-icon request was fixed by adding the generated app icon;
its intentionally simulated outage requests are not counted as unexpected failures.

## Limits

The Docker daemon was stopped. **Container image builds and Compose startup were
not executed locally.** Compose configuration was validated, and application
packaging/runtime behavior was checked outside Docker. The configured CI workflow
includes container builds, PostgreSQL integration, and a full-stack HTTP smoke test,
but that remote workflow has not run because this repository has not been published.

These checks establish a working starter, not product-specific authorization,
tenant isolation, load capacity, or a deployment-provider certification. Memory
mode remains disposable; production configuration requires PostgreSQL.
