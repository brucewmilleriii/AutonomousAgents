# AutonomousAgents

A small Task Ledger API built and maintained by a four-agent Claude Code team, with a human approving every merge.

| Agent                                         | Job                                           | Edits code?        |
| --------------------------------------------- | --------------------------------------------- | ------------------ |
| Lead Orchestrator (main session, `/run-task`) | Intake, worktrees, routing, PRs               | No                 |
| `feature-builder`                             | Test-first implementation in its own worktree | Yes, in scope only |
| `code-auditor`                                | Adversarial correctness and security review   | No                 |
| `verification-gatekeeper`                     | Clean re-run of every check with evidence     | No                 |

## Quick start

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify      # lint, format, typecheck, tests + coverage
pnpm dev         # http://127.0.0.1:3000/health
```

## Run the team on an issue

1. Open an issue with the **Agent task** template and add the `agent` label.
2. In this repo, start Claude Code and run `/run-task <issue-number>`.
3. Approve the push when asked, review the PR, and merge it yourself.

## API

| Method | Path       | Notes                                                                   |
| ------ | ---------- | ----------------------------------------------------------------------- |
| GET    | /health    | `{status:"ok"}`                                                         |
| GET    | /tasks     | List; filters `status`, `owner`; `sort`, `order`, `limit`, `offset`     |
| POST   | /tasks     | `{title, description?, owner?}` → 201                                   |
| GET    | /tasks/:id | 404 if missing                                                          |
| PATCH  | /tasks/:id | Any of title, description, owner (null clears), status; records history |
| DELETE | /tasks/:id | 204, then 404                                                           |

`GET /tasks` sorts by `sort` = `createdAt` (default), `updatedAt` or `dueDate`, and `order` = `asc` (default) or `desc`. Sorting is applied before `limit`/`offset`; ties keep insertion order; with `sort=dueDate`, tasks without a dueDate come last in both directions. Other values return 400.

Status values: `todo`, `in_progress`, `in_review`, `done`, `blocked`.

## Safety

See `CLAUDE.md` for the rules every agent follows and `.claude/hooks/` for what is enforced. Hooks block destructive git and shell commands, `.env` access, dependency changes, merges, and edits on main. Branch protection on `main` (required review + CI) is the final backstop.
