# AutonomousAgents

Task Ledger API (TypeScript, Node 22, Fastify, Zod, Vitest), built by an approval-gated Claude Code agent team. A human merges every PR.

## Commands

- `pnpm install --frozen-lockfile` install (never `pnpm add` without human sign-off)
- `pnpm verify` lint + format check + typecheck + tests with coverage. Must pass before any handoff.
- `pnpm test` tests only. `pnpm dev` runs the API on 127.0.0.1:3000.
- `scripts/agent-worktree.sh create|path|list|remove` manages task worktrees in `../wt/<id>`.

## Code map

- `src/app.ts` builds the Fastify app. `src/tasks/` holds schema (Zod), store, and routes.
- `tests/` Vitest tests using `app.inject`. Every route change needs a test here.

## Hard rules for every agent and session

1. Correctness and security over speed. If unsure, stop and ask.
2. Never run destructive commands (rm -rf, force push, reset --hard, rebase, DROP/TRUNCATE) without explicit human confirmation in this conversation.
3. Never push to main, merge a PR, or approve a PR. Humans merge.
4. Source changes happen only in an agent worktree on an `agent/<id>-<slug>` branch, never on main.
5. Human sign-off required for: new or upgraded dependencies, schema or data migrations, CI/hook/agent-config changes, and any paid external API call.
6. Never read, print, log, or commit secrets, API keys, tokens, or .env files.
7. Never skip, weaken, or delete a test to make a check pass. Never use --no-verify.
8. If a hook blocks you, stop and report it. Do not work around a hook.
9. Commit messages: `<type>(<area>): <what> [T-xxx]`, one idea per commit.

## Lead Orchestrator (run with `/run-task <issue>`)

You coordinate; you never edit src/ or tests/. Subagents: `feature-builder`, `code-auditor`, `verification-gatekeeper`.

1. Intake: `gh issue view <n>`. Choose the next task id (`T-` + issue number, zero-padded to 3). Write `.agents/handoffs/<id>/task.json`:
   `{"id","issue","goal","acceptance":[...],"scope":[files],"gated":[...],"branch","worktree"}`.
   If acceptance criteria are vague, or `gated` is non-empty (deps, migrations, CI, paid APIs), STOP and ask the human first.
2. Isolate: `scripts/agent-worktree.sh create <id> <slug>`. Never reuse another task's worktree.
3. Build: invoke `feature-builder` with the full task JSON. Save its JSON as `build.json`. If status is "blocked", stop and ask the human.
4. Audit: invoke `code-auditor` with task JSON, worktree, and build report. Save as `audit.json` (append round number on re-reviews: `audit-2.json`).
   - "bounce": send findings back to `feature-builder`, then audit again. Max 3 rounds, then stop and ask the human.
   - `escalate: true`: stop and tell the human immediately.
5. Gate: invoke `verification-gatekeeper` with task JSON, worktree, and the approved commit. Save as `gate.json`. On FAIL, send the reason to the builder once, then re-audit and re-gate. A second FAIL: stop and ask the human.
6. Ship (needs human OK for the push in this session): `cd <worktree> && git push -u origin <branch>`, then `gh pr create --draft --base main` with the PR template filled from the four JSON files. When `gh pr checks` is green, `gh pr ready`. Tell the human the PR link. Never merge.
7. After the human merges: `scripts/agent-worktree.sh remove <id>` and add one line to `.agents/memory/decisions.md` if the task taught the team something.

Retry budget per task: 3 audit rounds, 2 gate runs, 1 hour of wall time. Exceeding any budget means stop and summarize for the human.

## Shared memory

- `.agents/memory/decisions.md` durable lessons and conventions (append-only, one line each, dated).
- `.agents/handoffs/<id>/` per-task JSON handoffs (git-ignored, local only).
