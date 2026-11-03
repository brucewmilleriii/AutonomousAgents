#!/usr/bin/env bash
# PostToolUse hook for Edit and Write: format the file, then lint it.
# Exit 2 sends lint errors back to the agent so it fixes them right away.
set -uo pipefail
input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')"
[[ "$file" =~ \.(ts|js|json|md)$ ]] || exit 0
[[ -f "$file" ]] || exit 0

root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0
[[ -d node_modules ]] || exit 0

pnpm exec prettier --write --log-level warn "$file" >/dev/null 2>&1 || true

if [[ "$file" =~ \.ts$ ]]; then
  if ! out="$(pnpm exec eslint --no-warn-ignored "$file" 2>&1)"; then
    echo "Lint errors in $file. Fix them before moving on:" >&2
    echo "$out" | tail -40 >&2
    exit 2
  fi
fi
exit 0
