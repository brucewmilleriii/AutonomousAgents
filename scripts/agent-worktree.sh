#!/usr/bin/env bash
# Manage isolated agent worktrees. One task = one branch = one worktree.
#   scripts/agent-worktree.sh create T-012 task-filter
#   scripts/agent-worktree.sh path   T-012
#   scripts/agent-worktree.sh list
#   scripts/agent-worktree.sh remove T-012   (refuses if the worktree has uncommitted changes)
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
wt_base="$(dirname "$root")/wt"
cmd="${1:-}"
id="${2:-}"

valid_id() { [[ "$1" =~ ^T-[0-9]+$ ]] || { echo "Task id must look like T-012" >&2; exit 1; }; }

case "$cmd" in
  create)
    valid_id "$id"
    slug="${3:-}"
    [[ "$slug" =~ ^[a-z0-9-]{3,40}$ ]] || { echo "Slug must be 3-40 chars of a-z, 0-9, -" >&2; exit 1; }
    branch="agent/$id-$slug"
    path="$wt_base/$id"
    [[ -e "$path" ]] && { echo "Worktree $path already exists" >&2; exit 1; }
    git -C "$root" fetch origin main --quiet
    mkdir -p "$wt_base"
    git -C "$root" worktree add -b "$branch" "$path" origin/main
    (cd "$path" && pnpm install --frozen-lockfile --silent)
    mkdir -p "$root/.agents/handoffs/$id"
    echo "$path"
    ;;
  path)
    valid_id "$id"
    echo "$wt_base/$id"
    ;;
  list)
    git -C "$root" worktree list
    ;;
  remove)
    valid_id "$id"
    path="$wt_base/$id"
    [[ -d "$path" ]] || { echo "No worktree at $path" >&2; exit 1; }
    if [[ -n "$(git -C "$path" status --porcelain)" ]]; then
      echo "Worktree $path has uncommitted changes. Ask the human before removing it." >&2
      exit 1
    fi
    git -C "$root" worktree remove "$path"
    echo "Removed $path (branch kept)"
    ;;
  *)
    echo "Usage: $0 {create <id> <slug>|path <id>|list|remove <id>}" >&2
    exit 1
    ;;
esac
