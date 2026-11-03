#!/usr/bin/env bash
# Stops an agent that keeps re-running the same command without changing anything.
# Registered on PreToolUse for Bash and on PostToolUse for edits.
# An edit resets the streak; 4 identical Bash runs in a row with no edit between
# them means the 5th is blocked and the agent must escalate.
set -euo pipefail
input="$(cat)"
session="$(printf '%s' "$input" | jq -r '.session_id // "unknown"' | tr -cd 'a-zA-Z0-9_-')"
tool="$(printf '%s' "$input" | jq -r '.tool_name // ""')"

dir="${CLAUDE_PROJECT_DIR:-.}/.agents/.loopguard"
mkdir -p "$dir"
log="$dir/$session.log"

if [[ "$tool" != "Bash" ]]; then
  echo "EDIT" >>"$log"
  exit 0
fi

cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"
[[ -z "$cmd" ]] && exit 0
hash="$(printf '%s' "$cmd" | sha256sum | cut -c1-16)"

streak=0
if [[ -f "$log" ]]; then
  while IFS= read -r line; do
    [[ "$line" == "$hash" ]] || break
    streak=$((streak + 1))
  done < <(tac "$log")
fi

if (( streak >= 4 )); then
  echo "BLOCKED by loop-guard: this exact command ran $streak times in a row with no code change between runs." >&2
  echo "You are in a retry loop. Stop, write what you tried and what failed to the task handoff, and escalate to the Orchestrator or the human." >&2
  exit 2
fi
echo "$hash" >>"$log"
exit 0
