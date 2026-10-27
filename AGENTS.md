# Repository guidance

Use SOLID, DRY, and OOP where they clarify ownership and behavior. Choose the
creational, structural, or behavioral pattern that solves the actual problem; do
not add every pattern to every feature. See `docs/design-patterns.md` for the
catalog and the patterns demonstrated here.

- Read `README.md`, `docs/architecture.md`, and the relevant feature before editing.
- Keep deployable applications in `apps/` and reusable public libraries in `packages/`.
- Applications never import one another. Declare every dependency in its consumer.
- Keep domain and application logic free of Nest, Next, HTTP, and database imports.
- Compose repository implementations and use cases in the Nest module.
- Keep browser-safe contracts separate from ORM entities and server secrets.
- Group frontend code by feature and compose features at the app layer.
- Use package exports, never relative paths into another workspace package.
- Keep migrations explicit and review generated SQL before applying it.
- Validate configuration and untrusted request/response data at boundaries.
- Keep examples runnable; avoid empty speculative services, layers, and wrappers.
- Verify with `pnpm check`. Use `TEST_DATABASE_URL=... pnpm test:integration`
  against a disposable PostgreSQL database when changing persistence.
- Record what actually passed and any unavailable checks in `docs/verification.md`.
