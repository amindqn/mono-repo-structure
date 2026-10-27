# Web Platform

A working **Next.js + NestJS** monorepo with pnpm, Turborepo, strict TypeScript,
shared Zod contracts, and PostgreSQL persistence. The example application, Forma,
lets you create tasks and change their status through the complete stack.

The architecture follows SOLID and DRY: business behavior lives in small use cases,
persistence sits behind a repository port, and frameworks stay at the edges.

## Start in two commands

Use Node **24** and pnpm **11.15.1** (`npm install --global pnpm@11.15.1` if needed).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:4000/api/v1/tasks>
- Swagger UI: <http://localhost:4000/docs>
- OpenAPI: <http://localhost:4000/docs/openapi.json>

No environment file or database is needed for the disposable demo. The API logs a
notice and the UI labels memory storage. **Tasks disappear when the API restarts.**
The frontend calls a same-origin Next route handler; that handler forwards to Nest.

## Repository layout

```text
apps/
  web/                         Next App Router application
    src/app/                   Routes, providers, runtime API proxy
    src/features/tasks/        Task UI and query hooks
    src/components/            Shared visual primitives
    src/lib/                   Browser client and server proxy
  api/                         Nest application with Fastify
    src/modules/tasks/
      domain/                  Entity and repository interface
      application/             Framework-independent use cases
      infrastructure/          Memory and PostgreSQL adapters
      presentation/            Controller and Nest DTO wrappers
    src/modules/health/        Liveness and storage readiness
    src/infrastructure/        Database schema, connection, composition
    src/common/                HTTP error mapping
    src/config/                Validated environment
    drizzle/                   SQL migrations and generation snapshots
    test/                      Domain, HTTP, PostgreSQL integration tests
packages/
  contracts/                   Browser-safe schemas and inferred DTO types
  api-client/                  Validated, typed fetch facade
  tooling/                     Shared ESLint and TypeScript configuration
scripts/                       Automated architecture checks
docs/                          Research, decisions, patterns, verification
.github/                       CI and dependency update configuration
```

## Use a durable local database

Docker must be running. The Compose database is bound to loopback and uses local
development credentials. It stores data in the `postgres_data` named volume.

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:up
```

Set these values in `apps/api/.env`:

```dotenv
PERSISTENCE=postgres
DATABASE_URL=postgresql://app:local-development-only@127.0.0.1:5432/web_platform
```

Then run:

```sh
pnpm db:migrate
pnpm dev
```

The API refuses memory persistence when `NODE_ENV=production`. A readiness check
queries the tasks table, so a database without migrations reports unavailable.

## Common commands

| Command                                        | Purpose                                                        |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                                     | Build shared packages, then watch apps and libraries           |
| `pnpm build`                                   | Build packages before dependent applications                   |
| `pnpm start`                                   | Start previously built apps with their local environment files |
| `pnpm check`                                   | Format check, lint/boundaries, types, tests, production builds |
| `pnpm boundaries`                              | Reject illegal workspace/layer imports and package cycles      |
| `pnpm test`                                    | Run contract, client, domain, and initialized HTTP tests       |
| `TEST_DATABASE_URL=... pnpm test:integration`  | Migrate and test a disposable PostgreSQL database              |
| `pnpm db:generate`                             | Generate SQL after editing the database schema                 |
| `pnpm db:migrate`                              | Apply committed migrations explicitly                          |
| `pnpm format`                                  | Format source, configuration, and documentation                |
| `pnpm --filter @repo/api build`                | Run one package script directly                                |
| `pnpm exec turbo run build --filter=@repo/web` | Build web and its dependency graph                             |

Integration tests require an explicitly supplied **disposable test database**.
They do not truncate tables and clean up their own successful test record.

`pnpm start` runs the compiled API and the Next standalone server. The web build
copies static assets into standalone output. Run build before start. Environment
files live with their applications; the root does not distribute secrets to every task.

## Containers and deployment

```sh
docker compose up --build -d
```

This local full-stack setup starts PostgreSQL, runs the migration job, waits for API
readiness, and exposes Next at <http://localhost:3000>. `docker compose down` stops
services while preserving database storage. The two application Dockerfiles have
separate build/runtime stages and run as the unprivileged Node user.

For a real deployment, supply managed database credentials, TLS ingress, secret
management, and product-specific authentication/authorization. The example task API
has no accounts or tenant isolation. Do not reuse Compose development credentials.
Run migration jobs once per release before promoting app instances.

The web container uses a server-only `API_ORIGIN` at **runtime**. It does not need a
different build for each backend URL. Nest does not expose CORS by default; browser
traffic uses the same-origin proxy. If you expose the API independently, configure
an explicit allowed-origin policy for that deployment.

CI runs quality checks, real PostgreSQL integration tests, container builds, and a
full-stack HTTP smoke check. Dependency updates are grouped for related frameworks.
Remote Turbo caching is optional and is not configured with any hosted service.

## Read next

- [Research and source links](docs/research.md): alternatives and selection rationale.
- [Architecture](docs/architecture.md): dependency rules, data flow, extension guide.
- [Design patterns](docs/design-patterns.md): concrete uses and the full requested catalog.
- [Architecture decisions](docs/decisions/0001-workspace-and-application-boundaries.md).
- [Verification](docs/verification.md): checks actually run and remaining limits.
- [Implementation plan](docs/plan.md).

## Troubleshooting

- Port in use: stop only the process you own or adjust each app's development script
  and environment. Default ports are web 3000, API 4000, and PostgreSQL 5432.
- API offline: check that Nest started and `apps/web/.env.local` has the correct
  `API_ORIGIN`. A proxy failure is shown as an actionable UI error.
- Database not ready: check `DATABASE_URL`, start the database, and apply migrations.
- A shared import fails on a fresh checkout: run through the root scripts so Turbo
  builds dependencies first. Package exports intentionally point at compiled output.
- Dependency install fails on release age: choose a mature compatible version or wait;
  do not globally disable the policy to install a fresh release.
- There is no imposed application license. Choose a license before publishing this
  starter; dependency licenses remain their respective authors' licenses.
