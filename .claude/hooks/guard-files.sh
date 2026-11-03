#!/usr/bin/env bash
# PreToolUse hook for Read, Edit, Write, MultiEdit, NotebookEdit.
# - Never touch secrets.
# - Never edit source on the main branch: edits happen in agent worktrees.
# - Protected paths (CI, hooks, agent config, dependencies) need a human:
#   set AGENT_ALLOW_PROTECTED=1 in a human-driven session to edit them.
set -euo pipefail
input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // ""')"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')"
[[ -z "$file" ]] && exit 0

block() {
  echo "BLOCKED by guard-files: $1 ($file)" >&2
  echo "Stop and ask the human. Do not work around this hook." >&2
  exit 2
}

base="$(basename "$file")"
case "$base" in
  .env | .env.* ) [[ "$base" == ".env.example" ]] || block "secrets file" ;;
  *.pem | *.key | id_rsa* | id_ed25519* | *.p12 ) block "key material" ;;
esac

[[ "$tool" == "Read" ]] && exit 0

if [[ "${AGENT_ALLOW_PROTECTED:-0}" != "1" ]]; then
  case "$file" in
    */.github/* | */.claude/* | */CLAUDE.md | */package.json | */pnpm-lock.yaml | */scripts/agent-worktree.sh | */tsconfig*.json | */eslint.config.js | */vitest.config.ts )
      block "protected path: CI, hooks, agent config, dependencies, or quality gates" ;;
  esac
fi

# No source edits on main: they belong in an agent worktree on its own branch.
dir="$(dirname "$file")"
while [[ ! -d "$dir" && "$dir" != "/" ]]; do dir="$(dirname "$dir")"; done
branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if [[ "$branch" == "main" || "$branch" == "master" ]]; then
  case "$file" in
    */src/* | */tests/* ) block "editing source on $branch; create a worktree with scripts/agent-worktree.sh" ;;
  esac
fi

exit 0
