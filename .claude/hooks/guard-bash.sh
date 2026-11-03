#!/usr/bin/env bash
# PreToolUse hook for Bash. Exit 2 blocks the command and shows stderr to the agent.
set -euo pipefail
input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

block() {
  echo "BLOCKED by guard-bash: $1" >&2
  echo "This needs explicit human confirmation. Stop and ask the human; do not try a workaround." >&2
  exit 2
}

# Destructive file and git operations
[[ "$cmd" =~ rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive) ]] && block "recursive delete (rm -rf)"
[[ "$cmd" =~ git[[:space:]]+push.*(--force|-f([[:space:]]|$)|--force-with-lease|\+[a-zA-Z]) ]] && block "force push"
[[ "$cmd" =~ git[[:space:]]+push.*([[:space:]]|:)(main|master)([[:space:]]|$) ]] && block "push to main (open a PR instead)"
[[ "$cmd" =~ git[[:space:]]+reset[[:space:]]+--hard ]] && block "git reset --hard"
[[ "$cmd" =~ git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f ]] && block "git clean -f"
[[ "$cmd" =~ git[[:space:]]+branch[[:space:]]+-D ]] && block "force branch delete"
[[ "$cmd" =~ git[[:space:]]+(rebase|filter-branch|filter-repo) ]] && block "history rewrite"
[[ "$cmd" =~ git[[:space:]]+commit.*--no-verify ]] && block "skipping commit hooks"

# Merging and approving is human-only
[[ "$cmd" =~ gh[[:space:]]+pr[[:space:]]+(merge|review[[:space:]].*--approve) ]] && block "merging or approving a PR"
[[ "$cmd" =~ gh[[:space:]]+(repo[[:space:]]+delete|secret|api[[:space:]].*-X[[:space:]]*(DELETE|PUT)) ]] && block "repo, secret, or destructive API change"

# Databases
shopt -s nocasematch
[[ "$cmd" =~ (drop[[:space:]]+(table|database|schema)|truncate[[:space:]]+table) ]] && block "destructive SQL"
shopt -u nocasematch

# Secrets and environment
[[ "$cmd" =~ (^|[[:space:]/])\.env([[:space:]]|$|\.) ]] && block "reading or writing .env files"
[[ "$cmd" =~ (^|[[:space:];|&])(env|printenv)([[:space:]]*$|[[:space:]]*\|) ]] && block "dumping environment variables"

# Dependencies change the supply chain: human sign-off
[[ "$cmd" =~ (pnpm|npm|yarn)[[:space:]]+(add|install[[:space:]]+[^-]|i[[:space:]]+[^-]|remove|uninstall) ]] && block "dependency change"

# Remote code execution
[[ "$cmd" =~ (curl|wget)[^|]*\|[[:space:]]*(ba|z)?sh ]] && block "piping a download into a shell"

exit 0
