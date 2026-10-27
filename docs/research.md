# Monorepo research and recommendation

Researched on **27 October 2026** for an empty repository. Scope: a web frontend and
backend, shared contracts, maintainability, deployment, and practical design patterns.
The selected frameworks are **Next.js and NestJS**, as requested by the owner.

## Recommendation

Use a **pnpm workspace with Turborepo**, independently deployable applications in
`apps/`, and a small number of genuinely shared libraries in `packages/`. Inside
each application, organize by business feature. Start as a modular monolith;
extract services only when a deployment, scaling, or ownership requirement warrants it.

This is a recommendation for this scope, not a universal best layout. Package boundaries,
runtime validation, repeatable builds, and working examples matter more than folder names.

## Options considered

| Option                        | Strengths                                                       | Costs                                          | Decision                                               |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| pnpm workspaces alone         | Native workspace linking, few tools                             | No task graph or artifact cache                | Good smaller alternative                               |
| pnpm + Turborepo              | Explicit package graph, cached builds, standard package scripts | Architecture enforcement needs separate rules  | Selected for two TypeScript applications               |
| Nx                            | Rich graph, generators, boundary rules, broader orchestration   | More features and conventions to maintain      | Reconsider for many teams, languages, or generators    |
| Nest CLI monorepo as the root | Convenient for several Nest applications                        | Its workspace is oriented around Nest projects | Use a regular Nest application inside pnpm instead     |
| Next.js as the entire backend | One application and deployment                                  | Couples the API lifecycle to Next              | Keep business operations in the requested Nest backend |

Both Nx and Turbo maintain their own comparisons; those are vendor perspectives,
not neutral benchmarks. No performance benchmark was run for this repository.
[Nx comparison](https://nx.dev/docs/kb/nx-vs-turborepo),
[Turbo migration rationale](https://turborepo.dev/docs/guides/migrating-from-nx).

## Primary sources and their effect on the implementation

1. [Turborepo repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
   and [official GitHub example](https://github.com/vercel/turborepo/tree/main/examples/with-vite):
   use explicit workspace manifests, `apps/*`, and `packages/*`. The Vite example was
   inspected for workspace organization, not copied as the requested frontend framework.
2. [Turborepo package types](https://turborepo.dev/docs/core-concepts/package-types):
   applications are deployment endpoints in the dependency graph. Neither app imports
   the other app. Shared libraries expose public package entry points.
3. [Internal packages](https://turborepo.dev/docs/core-concepts/internal-packages):
   compile contracts and the HTTP client to JavaScript and declarations. This gives the
   Node backend real runtime exports and explicit upstream build dependencies.
4. [pnpm workspaces](https://pnpm.io/workspaces) and [catalogs](https://pnpm.io/catalogs):
   use `workspace:*` for local packages and one catalog for external versions. Every
   consumer still declares its own dependencies; a catalog does not replace manifests.
5. [pnpm settings](https://pnpm.io/settings): pin the package manager, use strict peer
   checking, a release-age policy, and an explicit dependency-build allowlist. The pinned
   CLI's behavior is checked during installation rather than assuming the latest website
   describes every older version identically.
6. [Nest workspaces](https://docs.nestjs.com/cli/monorepo): Nest supports standard and
   monorepo organization. A pnpm-owned workspace preserves independent application
   manifests without nesting a second workspace manager around the frontend.
7. [Nest custom providers](https://docs.nestjs.com/fundamentals/custom-providers):
   symbol tokens and factory providers connect use cases to repository interfaces.
   Domain and application classes do not import Nest or an ORM.
8. [Nest Fastify adapter](https://docs.nestjs.com/techniques/performance): use the
   supported Fastify platform adapter and compatible plugins. This choice is about a
   supported HTTP adapter; it is not a performance claim for this starter.
9. [brocoders Nest architecture](https://github.com/brocoders/nestjs-boilerplate/blob/main/docs/architecture.md):
   separate the domain from persistence adapters. Keep the repository specific to task
   operations instead of implementing a universal generic CRUD repository.
10. [Bulletproof React structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md):
    colocate task components and query hooks in a feature; compose at the application
    level. Create shared folders only when there is shared code to put in them.
11. [Next package transpilation](https://nextjs.org/docs/pages/api-reference/config/next-config-js/transpilePackages)
    and [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output):
    support workspace libraries and trace from the repository root for container output.
12. [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod): reuse Zod schemas for
    request validation, response serialization, and generated OpenAPI. Keep Nest DTO
    wrappers in the API, so the browser contract package remains framework independent.
13. [Drizzle migrations](https://orm.drizzle.team/docs/migrations): commit generated,
    reviewable SQL and migration metadata. Run migrations explicitly; do not push schema
    changes automatically on every API startup.
14. [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/): use HTTP injection
    to exercise the initialized backend without binding a public port. Always close apps.
15. [Turbo environment variables](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables):
    pass runtime variables explicitly and disable caching for persistent development
    processes. The Next proxy reads the backend origin at runtime on the server.

## GitHub, Reddit, and Stack Overflow cross-check

The GitHub repositories above were inspected directly, including the official Turbo
example, Bulletproof React, the brocoders architecture guide, and nestjs-zod. These
provide concrete implementations to compare with the official documentation.

Community discussion was used to identify questions and failure modes, not as
authoritative framework documentation:

- [Reddit: rigorously structuring a frontend/backend monorepo](https://www.reddit.com/r/typescript/comments/1uo498j/im_going_insane_on_how_to_rigorously_structure_my/):
  contributors disagree about how much architecture small apps need, but raise useful
  concerns about uncontrolled imports and premature fragmentation. The response here
  is a small feature module plus an automated boundary check.
- [Reddit: running a monorepo](https://www.reddit.com/r/node/comments/1i0nskb):
  workspace linking and task orchestration are distinct responsibilities. Implementation
  details were checked against the pnpm and Turbo primary sources above.
- [Stack Overflow: shared pnpm dependencies and binaries](https://stackoverflow.com/questions/78722597/efficiently-managing-shared-dependencies-and-binaries-in-a-pnpm-monorepo-workspa):
  the answer highlights declaring runtime dependencies at their consumers and using
  catalogs for version consistency. The pnpm catalog documentation confirms this setup.
- [Reddit: pnpm/Turbo dependency management](https://www.reddit.com/r/webdev/comments/146rzbh/monorepo_dependency_management_pnpm_turborepo/):
  older examples contain obsolete or unsupported Turbo configuration. They were not
  used as configuration recipes. The installed Turbo validates the actual config.

## Version compatibility findings

Registry manifests were checked before installation. Nest 12 was available, but the
selected nestjs-zod release declares Nest 10/11 support. Therefore the starter pins
**Nest 11.2.8**, Swagger 11.4.7, and nestjs-zod 5.5.0 together. TypeScript 7 was
available, but typescript-eslint 8.72 declares a range below 6.1, so the starter
pins **TypeScript 5.9.3**. Next is pinned to **16.4.3** and React to **19.3.1**.
The exact dependency graph is recorded in `pnpm-lock.yaml`.

The 24-hour release-age rule also excluded the newest query/lint patch releases at
installation time. Compatible mature patches were selected instead: TanStack Query
5.104.5 and typescript-eslint 8.72.0. Vite is a test-runner dependency, not the web framework.

The production audit identified vulnerable exact transitive pins in the compatible
Nest adapter/Swagger releases. Workspace overrides move Fastify to 5.12.7 and
Swagger's js-yaml to 5.5.0. Keep those overrides until upstream dependency manifests
include the fixes; recheck adapter compatibility and the audit on upgrades.

## Scope decisions

The repository now also implements authentication, rotating refresh sessions, user profiles,
private tasks, and media uploads to database or object storage. The original starter
research above remains the workspace rationale. The follow-up [foundation design](foundation-features.md)
records the added features and current primary sources for passwords, refresh replay,
CSRF, file handling, and React Query policies. Email verification/recovery, MFA, and
external identity providers require further product/provider choices.
