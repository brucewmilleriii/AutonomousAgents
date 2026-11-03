---
description: Show every open agent worktree, its branch, and the latest handoff for each task.
---

Run `scripts/agent-worktree.sh list` and `gh pr list --search "head:agent/"`. For each task folder in .agents/handoffs/, read the newest JSON file. Report one line per task: id, branch, stage (built, audited, gated, PR open), and anything waiting on the human. Do not change anything.
