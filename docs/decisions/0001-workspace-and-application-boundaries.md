# ADR 0001: Workspace ownership and feature boundaries

Date: 2026-10-27. Status: accepted for this starter.

## Context

The owner requested a frontend/backend monorepo, research across public sources,
and practical SOLID/DRY/OOP patterns. The chosen frameworks are Next.js and NestJS.
The destination was empty and had no existing application or deployment requirements.

## Decision

pnpm owns workspace linking and one lockfile. Turbo owns task dependencies and local
caching. Each app has its own manifest and deployment output. Shared schemas and
the client are compiled internal packages with explicit exports. Shared lint/type
configuration lives in a tooling package. Nest's CLI monorepo mode is not layered
on top of this workspace.

The backend is a modular monolith with feature-local ports/adapters. Use cases are
plain classes composed by Nest. Drizzle/PostgreSQL is durable persistence; memory
mode is disposable development/test infrastructure and is rejected in production.
Next App Router composes a feature-based client UI and a runtime, fixed-origin proxy.

## Consequences

The package graph is small and visible in ordinary manifests. Applications deploy
independently while contracts change atomically in one repository. Shared compiled
packages must be built before consumption; root scripts automate that ordering.
Native Node watch and TypeScript watch keep development output current.

Boundary enforcement is a local script plus ESLint/package exports, so it must evolve
with new layers or features. Nx remains a reasonable future option if graph tooling,
generators, polyglot projects, or team requirements grow. No service extraction or
distributed event infrastructure is justified by the current example.
