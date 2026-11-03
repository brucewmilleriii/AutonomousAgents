# Team decisions and lessons

Append-only. One dated line per entry. Read this before starting any task.

- 2026-11-03: Stack is TypeScript 5 strict, Node 22, Fastify 5, Zod 4, Vitest. Coverage floor 80% lines, branches, functions, statements.
- 2026-11-03: Validate every request input with Zod in the route; return `{error, issues}` with status 400 on failure.
- 2026-11-03: Tests use `app.inject` and an injected clock via `createMemoryStore(clock)` so timestamps are deterministic.
