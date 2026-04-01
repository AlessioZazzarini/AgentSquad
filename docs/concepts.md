# Concepts

## The 3-File System

Every task is defined by three files in `.tasks/<task-id>/`:

### status.json

Machine-readable state. Updated ONLY via `scripts/agentsquad/update-status.sh` (never edited directly). Schema:

```json
{
  "status": "investigating",
  "complexity": "medium",
  "priority": "P1",
  "type": "implement",
  "attempts": 1,
  "branch": "task/my-task",
  "github_issue": "42",
  "pr_url": "https://github.com/...",
  "blocked_reason": "",
  "updated_at": "2026-04-01T12:00:00Z"
}
```

### acceptance-criteria.md

The worker's contract. Defines what "done" looks like. Must include:
- Clear, testable criteria
- Expected behavior descriptions
- Edge cases to handle

Without acceptance criteria, a worker has no definition of done and will either stop too early or loop forever.

### execution-log.md

Real-time progress log written by the worker. You monitor this file to track progress. Contains:
- Investigation steps and hypotheses
- Confidence scores for each hypothesis
- Build/test results
- Decision rationale

## Task Types

### Plan
Architecture, design, and research tasks. The worker produces a plan document, not code. Useful for breaking down complex features before implementation.

### Implement
Build features or fix bugs. The worker produces code, tests, and a PR. This is the most common task type.

### Debug
Investigate and fix issues using hypothesis-driven methodology. The worker forms hypotheses with confidence scores, tests them, and implements the winning fix.

## Compliance Enforcement

The loop framework runs a 7-point checklist every iteration to prevent premature stopping:

1. **Acceptance criteria** — Are all criteria met?
2. **Build/tests** — Do they pass?
3. **Execution log** — Is it up to date?
4. **Status** — Has it been updated via the script?
5. **Blockers** — Are there unresolved blockers?
6. **Completion promise** — Has it been fulfilled?
7. **PR** — Has it been created (if applicable)?

The checklist also bans specific phrases that indicate premature stopping:
- "I'll stop here"
- "This should be enough"
- "I think we're done"
- "Let me wrap up"

## The Promise System

When a worker is spawned, it receives a **completion promise** — a specific status value that must be reached before the worker can stop (e.g., `ready-for-review`). The compliance hook checks for this promise and blocks stopping until it is fulfilled.

## Complexity-to-Iteration Mapping

Task complexity determines the iteration budget:

| Complexity | Iterations | Use for |
|-----------|-----------|---------|
| simple | 15 | Single-file changes, config tweaks |
| medium | 20 | Multi-file features, moderate debugging |
| high | 30 | Cross-cutting changes, complex bugs |

These numbers are battle-tested. Simple tasks rarely need more than 10; high-complexity tasks regularly use 20+.

## Session Isolation

Three layers prevent workers from interfering with each other:

1. **Environment variable** (`AGENTSQUAD_LOOP_ENABLED`) — only set in worker sessions
2. **State file** (`.claude/loop.local.md`) — tracks active loop state
3. **Session ID** — only the session that started the loop can be stopped by the hook

Normal Claude Code sessions are completely unaffected — the hook checks the env var first and exits immediately if not set.
