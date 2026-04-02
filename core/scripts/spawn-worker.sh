#!/bin/bash
# Usage: spawn-worker.sh <task_id> [max_iterations_override]
# Spawns an autonomous worker in a tmux window with a dynamically built prompt.

set -euo pipefail

# Source config if available
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib"
if [ -f "$LIB_DIR/config.sh" ]; then
  source "$LIB_DIR/config.sh"
fi

# Resolve project root from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TASKS_DIR="${AGENTSQUAD_TASKS_DIR:-.tasks}"
WORK_DIR="${AGENTSQUAD_WORKDIR:-$PROJECT_ROOT}"

TASK_ID="$1"
WINDOW_NAME="task-${TASK_ID}"
SESSION="${AGENTSQUAD_TMUX_SESSION:-$(basename "$PROJECT_ROOT")}"
TASK_DIR="$PROJECT_ROOT/${TASKS_DIR}/${TASK_ID}"

# --- Validate task directory ---

STATUS_FILE="$TASK_DIR/status.json"
if [ ! -f "$STATUS_FILE" ]; then
  echo "ERROR: ${STATUS_FILE} not found" >&2
  exit 1
fi

# --- Create GitHub Issue if not already linked ---

ISSUE_NUMBER=$(jq -r '.github_issue // empty' "$STATUS_FILE")
if [ -z "$ISSUE_NUMBER" ]; then
  AC_FILE="$TASK_DIR/acceptance-criteria.md"
  if [ -f "$AC_FILE" ]; then
    ISSUE_BODY=$(cat "$AC_FILE")
  else
    ISSUE_BODY="Task: ${TASK_ID}"
  fi
  ISSUE_NUMBER=$(gh issue create \
    --title "task: ${TASK_ID}" \
    --body "$ISSUE_BODY" \
    --label "task" \
    2>&1 | grep -oP '\d+$')
  if [ -n "$ISSUE_NUMBER" ]; then
    bash "$SCRIPT_DIR/update-status.sh" "$TASK_ID" github_issue "$ISSUE_NUMBER"
    echo "Created GitHub Issue #${ISSUE_NUMBER}" >&2
  fi
fi

# --- Read task metadata from status.json ---

COMPLEXITY=$(jq -r '.complexity // "high"' "$STATUS_FILE")
PRIORITY=$(jq -r '.priority // "P0"' "$STATUS_FILE")
TASK_TYPE=$(jq -r '.type // "implement"' "$STATUS_FILE")

# Complexity → iteration budget mapping (battle-tested)
case "$COMPLEXITY" in
  simple) MAX_ITER=15 ;;
  medium) MAX_ITER=20 ;;
  *)      MAX_ITER=30 ;;
esac
MAX_ITER="${2:-$MAX_ITER}"

# --- Read acceptance criteria ---

AC_FILE="$TASK_DIR/acceptance-criteria.md"
if [ -f "$AC_FILE" ]; then
  AC_CONTENT=$(cat "$AC_FILE")
else
  AC_CONTENT="(No acceptance criteria found — generate them from the task description.)"
fi

# --- Find relevant interface docs ---

INTERFACE_SECTION=""
for iface in "$PROJECT_ROOT/${TASKS_DIR}/_interfaces/"*.md; do
  [ -f "$iface" ] || continue
  IFACE_NAME=$(basename "$iface")
  INTERFACE_SECTION="${INTERFACE_SECTION}
- ${TASKS_DIR}/_interfaces/${IFACE_NAME}"
done
if [ -z "$INTERFACE_SECTION" ]; then
  INTERFACE_SECTION="
(No interface docs found in ${TASKS_DIR}/_interfaces/)"
fi

# --- Read task-specific environment instructions ---

ENV_FILE="$TASK_DIR/environment.md"
if [ -f "$ENV_FILE" ]; then
  ENV_INSTRUCTIONS=$(cat "$ENV_FILE")
else
  ENV_INSTRUCTIONS="No task-specific environment instructions. Follow your project's CLAUDE.md for environment setup."
fi

# --- Build the .worker-prompt.md file ---

PROMPT_FILE="$TASK_DIR/.worker-prompt.md"
cat > "$PROMPT_FILE" << PROMPT_EOF
# Worker Assignment: ${TASK_ID}

**Priority:** ${PRIORITY} | **Complexity:** ${COMPLEXITY} | **Type:** ${TASK_TYPE} | **Max iterations:** ${MAX_ITER} | **GitHub Issue:** #${ISSUE_NUMBER:-none}

---

## Your Acceptance Criteria

${AC_CONTENT}

---

## Interface Docs Available
${INTERFACE_SECTION}

Read the relevant interface doc BEFORE investigating — it contains the full specification.

---

## Environment

${ENV_INSTRUCTIONS}

---

## Commands

Build: ${AGENTSQUAD_BUILD_CMD:-pytest}
Test: ${AGENTSQUAD_TEST_CMD:-pytest}
Lint: ${AGENTSQUAD_LINT_CMD:-}

---

## Cross-Model Collaboration

If the task is complex (high complexity, architectural decisions, security-sensitive, or you're stuck after 2 attempts), use \`/collab\` to get a second opinion from a secondary model:

\`\`\`
/collab think: "Challenge my approach to [problem]. What am I missing?"
/collab build: Delegate isolated implementation to the secondary model
/collab review: Quick review of your changes before finalizing
\`\`\`

Rules:
- Use /collab for architectural decisions and security-sensitive code
- Use /collab-review before marking ready-for-review on complex tasks
- Never overlap files between you and the secondary model

---

## GitHub Integration

**Progress comments** — post to your GitHub issue at these milestones ONLY:
\`\`\`bash
bash scripts/agentsquad/gh-comment.sh ${ISSUE_NUMBER:-none} "🔍 Investigating: [1-line summary of what you found]"
bash scripts/agentsquad/gh-comment.sh ${ISSUE_NUMBER:-none} "🔨 Implementing: [1-line summary of your approach]"
bash scripts/agentsquad/gh-comment.sh ${ISSUE_NUMBER:-none} "✅ Tests passing: X/X. Finalizing."
\`\`\`
Max 3-4 comments per task. Do NOT comment on every file read or command.

**Follow-up issues** — if you discover a bug or missing feature while working:
\`\`\`bash
bash scripts/agentsquad/gh-create-followup.sh ${ISSUE_NUMBER:-none} "bug: [short title]" "[description with repro steps]"
\`\`\`
Rules for follow-ups:
- Max 2 follow-up issues per task
- NEVER fix the follow-up inline — stay focused on YOUR acceptance criteria
- If the issue BLOCKS your current task, mark yourself blocked instead of branching
- If gh commands fail, continue working — GitHub comments are nice-to-have, not blocking

---

## Operational Rules

1. **Status updates:** ONLY via \`bash scripts/agentsquad/update-status.sh ${TASK_ID} <field> <value>\` — NEVER edit status.json directly
2. **Execution log:** Log every major step, hypothesis, and result to \`${TASKS_DIR}/${TASK_ID}/execution-log.md\`
3. **Branch:** Work on \`task/${TASK_ID}\` branch

---

## Pipeline (follow in order)

### Step 1: Update status
\`\`\`bash
bash scripts/agentsquad/update-status.sh ${TASK_ID} status "investigating"
\`\`\`

### Step 2: Read context
- Read CLAUDE.md for project conventions
- Read the interface doc(s) listed above
- Read the acceptance criteria above (already inline)

### Step 3: Investigate
- Read relevant source files, trace data flow
- Form hypotheses with confidence scores
- Write hypotheses to execution-log.md

### Step 4: Implement
You are already on branch \`task/${TASK_ID}\` (created by the worktree). Just verify with \`git branch --show-current\`.
\`\`\`bash
bash scripts/agentsquad/update-status.sh ${TASK_ID} status "implementing"
bash scripts/agentsquad/update-status.sh ${TASK_ID} branch "task/${TASK_ID}"
\`\`\`
- Implement the change. Minimal, focused edits only.

### Step 5: Testing
\`\`\`bash
bash scripts/agentsquad/update-status.sh ${TASK_ID} status "testing-local"
\`\`\`
- Run the Build, Test, and Lint commands listed in the Commands section above
- If tests fail, fix and retry (max 3 attempts)

### Step 6: Write Review Document
Before marking ready-for-review, create \`${TASKS_DIR}/${TASK_ID}/pr-review.md\`:

\`\`\`markdown
# PR Review: ${TASK_ID}

## What was done
<2-3 sentences describing the change>

## Files changed
<bullet list>

## How to verify
1. <step-by-step>

## Test results
- Build: pass/fail
- Tests: X passed, Y failed
\`\`\`

### Step 7: Complete
\`\`\`bash
bash scripts/agentsquad/update-status.sh ${TASK_ID} status "ready-for-review"
\`\`\`

---

## Guardrails

- **Max ${MAX_ITER} iterations** — if exceeded, update status to "blocked"
- **Max 3 attempts** per task — if exceeded, update status to "blocked" with reason
- **Single fix** per attempt — one hypothesis at a time
- **If blocked:** \`bash scripts/agentsquad/update-status.sh ${TASK_ID} status "blocked"\` then \`bash scripts/agentsquad/update-status.sh ${TASK_ID} blocked_reason "your reason"\` then STOP

## Logging

Update \`${TASKS_DIR}/${TASK_ID}/execution-log.md\` after EACH step — not just at the end. Log:
- When you start investigating
- Each hypothesis with confidence score
- When the fix is applied
- Build/test results (pass/fail)
- Final summary
PROMPT_EOF

# Copy prompt to worktree if using separate workdir (worktree won't have canonical .tasks/)
if [ -n "${AGENTSQUAD_WORKDIR:-}" ] && [ "$AGENTSQUAD_WORKDIR" != "$PROJECT_ROOT" ]; then
  WORKTREE_TASK_DIR="${AGENTSQUAD_WORKDIR}/${TASKS_DIR}/${TASK_ID}"
  mkdir -p "$WORKTREE_TASK_DIR"
  cp "$PROMPT_FILE" "$WORKTREE_TASK_DIR/.worker-prompt.md"
fi

echo "Built prompt: ${PROMPT_FILE}" >&2

# --- tmux: spawn Claude Code + send loop command ---

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "ERROR: tmux session '${SESSION}' does not exist. Start it first." >&2
  exit 1
fi

if tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -q "^${WINDOW_NAME}$"; then
  echo "Worker window ${WINDOW_NAME} already exists — skipping spawn" >&2
  exit 0
fi

# Log file for capturing crash output
WORKER_LOG="/tmp/agentsquad-worker-${TASK_ID}.log"

# Must use claude-opus-4-6 — Sonnet runs out of context on complex tasks
# AGENTSQUAD_PROJECT_ROOT ensures status updates write to canonical .tasks/
# (not the worktree's local copy) when running in git worktree isolation
#
# Key design decisions for crash resilience:
#   1. Run via bash -lc so the tmux window survives if claude exits
#   2. Redirect stderr to a log file for post-mortem debugging
#   3. sleep 120 after claude exits keeps the window alive for error capture
#   4. Larger terminal size (-x 200 -y 50) avoids TUI init issues in 80x24
tmux new-window -t "$SESSION" -n "$WINDOW_NAME" -x 200 -y 50 \
  "bash -lc 'export AGENTSQUAD_PROJECT_ROOT=\"${AGENTSQUAD_PROJECT_ROOT:-$PROJECT_ROOT}\" AGENTSQUAD_LOOP_ENABLED=1; cd \"${WORK_DIR}\" && claude --model claude-opus-4-6 --dangerously-skip-permissions 2>>\"${WORKER_LOG}\"; echo \"[worker-exit] Claude exited with code \$? at \$(date)\" >> \"${WORKER_LOG}\"; sleep 120'"

# --- Readiness polling (replaces fixed sleep 8) ---
# Poll for up to 45s with exponential backoff. Claude Code needs time to
# initialize its TUI, connect to the model, and probe MCP servers.
# Under CPU load this can take 15-25s (was crashing at fixed 8s).
MAX_WAIT=45
WAIT_ELAPSED=0
BACKOFF=3

echo "Waiting for ${WINDOW_NAME} to become ready..." >&2
while [ "$WAIT_ELAPSED" -lt "$MAX_WAIT" ]; do
  sleep "$BACKOFF"
  WAIT_ELAPSED=$((WAIT_ELAPSED + BACKOFF))

  # Check window still exists (crash detection)
  if ! tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -q "^${WINDOW_NAME}$"; then
    echo "ERROR: Worker window ${WINDOW_NAME} died during startup. Check ${WORKER_LOG}" >&2
    exit 1
  fi

  # Check that claude is actually running (not just the bash wrapper)
  # If claude crashed, only bash remains — detect this and abort
  PANE_PID=$(tmux list-panes -t "${SESSION}:${WINDOW_NAME}" -F '#{pane_pid}' 2>/dev/null | head -1)
  if [ -z "$PANE_PID" ]; then
    continue
  fi

  # Verify claude process is alive inside the pane (not just bash)
  if ! pgrep -P "$PANE_PID" -f "claude" >/dev/null 2>&1; then
    # Claude process not found — check if it already exited
    if [ "$WAIT_ELAPSED" -gt 15 ]; then
      echo "ERROR: Claude process not found in ${WINDOW_NAME} after ${WAIT_ELAPSED}s — likely crashed. Check ${WORKER_LOG}" >&2
      exit 1
    fi
    continue
  fi

  # Check if Claude Code's TUI is initialized by looking for its specific prompt
  # patterns. Avoid matching generic shell prompts ($, >) which would false-positive
  # if claude crashed and bash wrapper is showing its prompt.
  PANE_CONTENT=$(tmux capture-pane -t "${SESSION}:${WINDOW_NAME}" -p 2>/dev/null || true)
  if echo "$PANE_CONTENT" | grep -qE '(❯|Claude|tips|/help|cost)'; then
    echo "Worker ${WINDOW_NAME} ready after ${WAIT_ELAPSED}s" >&2
    break
  fi

  # Exponential backoff: 3s, 5s, 7s, 9s, ...
  BACKOFF=$((BACKOFF + 2))
  if [ "$BACKOFF" -gt 10 ]; then BACKOFF=10; fi
done

if [ "$WAIT_ELAPSED" -ge "$MAX_WAIT" ]; then
  echo "WARNING: Worker ${WINDOW_NAME} not confirmed ready after ${MAX_WAIT}s — sending command anyway" >&2
fi

# Send loop start command — reference the prompt file so worker reads full context
tmux send-keys -t "${SESSION}:${WINDOW_NAME}" \
  "/loop-start \"Read ${TASKS_DIR}/${TASK_ID}/.worker-prompt.md and follow every instruction in it exactly. You are a worker on task ${TASK_ID}.\" --max-iterations ${MAX_ITER} --completion-promise \"ready-for-review\"" C-m

echo "Spawned worker: ${WINDOW_NAME} (${PRIORITY}/${COMPLEXITY}, type=${TASK_TYPE}, max ${MAX_ITER} iterations)"
