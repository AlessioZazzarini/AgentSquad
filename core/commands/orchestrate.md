# /orchestrate - Triage GitHub Issues into the Task Queue

Fetch GitHub issues, parse dependencies, create task directories, then hand off to the Conductor for execution.

## Arguments

- `$ARGUMENTS` - Optional flags:
  - `--label <label>` - Label to filter issues (default: `squad:ready`)
  - `--dry-run` - Analyze and plan but don't create task directories
  - `--max <N>` - Maximum issues to process (default: no limit)
  - `--init` - Only create labels, don't process any issues (useful for bootstrapping new repos)

## Architecture

This command is **triage only**. It does NOT execute tasks. The Conductor (`conductor.sh`) handles all execution: spawning workers, finalizing PRs, health checks, approvals, and merges.

```
/orchestrate                          conductor.sh
(triage)                              (execution)
                                     
1. Fetch issues (squad:ready)         1. Finalize completed workers
2. Parse dependencies                 2. Check review artifacts
3. Create .tasks/<id>/ dirs           3. Apply approval policy
4. Apply squad:queued labels          4. Merge approved tasks
5. Call conductor.sh --once    ---->  5. Health check workers
                                      6. Spawn workers (up to MAX)
                                      7. Cycle summary notification
```

## Workflow

### Step 1: Parse Arguments

```bash
# Defaults
LABEL="squad:ready"
DRY_RUN=false
MAX_ISSUES=""

# Parse $ARGUMENTS for flags
```

### Step 2: Pre-flight Checks

```bash
# 1. Check git working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: Git working directory is not clean. Commit or stash changes first."
    exit 1
fi

# 2. Check we're on main/master
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ] && [ "$current_branch" != "master" ]; then
    echo "WARNING: Not on main/master branch. Currently on: $current_branch"
fi

# 3. Check no existing task session
if [ -f ".tasks/plan.md" ]; then
    echo "ERROR: Active task session exists. Run /cleanup first."
    exit 1
fi

# 4. Check gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "ERROR: GitHub CLI (gh) not installed."
    exit 1
fi
```

### Step 3: Ensure Required Labels Exist

Run these commands (idempotent via `--force`):

```bash
gh label create "squad:ready" --color "0E8A16" --description "Ready for AgentSquad orchestration" --force
gh label create "squad:queued" --color "FBCA04" --description "In the AgentSquad orchestration queue" --force
gh label create "squad:in-progress" --color "1D76DB" --description "Currently being processed by AgentSquad" --force
gh label create "squad:complete" --color "6F42C1" --description "Successfully processed by AgentSquad" --force
gh label create "squad:failed" --color "D93F0B" --description "AgentSquad processing failed" --force
gh label create "squad:triage" --color "C5DEF5" --description "Discovered by worker, needs human triage" --force
```

**If `--init` flag was provided**, stop here after creating labels.

### Step 4: Fetch Issues with Target Label

```bash
gh issue list --label "$LABEL" --state open --json number,title,body,labels --limit 100
```

If no issues found, report and exit.

### Step 5: Parse Dependencies

For each issue, extract from body:
- `depends-on: #N` or `blocked-by: #N` (case insensitive)
- `Depends on #N` or `Blocked by #N` in prose

### Step 6: Build Dependency Graph

Topological sort. If circular dependencies detected, STOP and report.

### Step 7: Create Task Directories

For each issue, create `.tasks/<task-id>/`:

```bash
mkdir -p ".tasks/$TASK_ID"
cat > ".tasks/$TASK_ID/status.json" <<EOF
{
  "status": "ready",
  "title": "$TITLE",
  "github_issue": $ISSUE_NUMBER,
  "dependencies": [$DEPS],
  "created_at": "$(date -Iseconds)",
  "branch": null,
  "pr_url": null
}
EOF
```

Copy acceptance criteria from issue body into `acceptance-criteria.md`.

### Step 8: Apply Queued Labels

```bash
for issue in issues; do
    gh issue edit $issue --remove-label "squad:ready" --add-label "squad:queued"
done
```

### Step 9: Hand Off to Conductor

```bash
bash scripts/agentsquad/conductor.sh --once
```

This runs a single tick: the Conductor will pick up the newly created tasks and spawn workers.

If `--dry-run`, skip this step.

### Step 10: Report

```
=================================================================
           AgentSquad Orchestration - Triage Complete
=================================================================

Issues triaged: 3
Task directories created:
  1. issue-42 - Add user authentication (no dependencies)
  2. issue-45 - Add profile page (depends on issue-42)
  3. issue-48 - Add settings page (depends on issue-42)

Conductor ran one tick. Use 'conductor.sh --loop 3m' for continuous mode.
```

---

## Issue Convention

1. **Label**: Must have `squad:ready` label (or custom label if `--label` specified)
2. **Dependencies**: Declare explicitly in issue body: `depends-on: #42`
3. **Content**: Should have clear acceptance criteria or checklist items

## GitHub Labels Reference

| Label | Color | Purpose |
|-------|-------|---------|
| `squad:ready` | Green (#0E8A16) | Ready for orchestration |
| `squad:queued` | Yellow (#FBCA04) | In the orchestration queue |
| `squad:in-progress` | Blue (#1D76DB) | Currently being processed |
| `squad:complete` | Purple (#6F42C1) | Successfully processed |
| `squad:failed` | Red (#D93F0B) | Processing failed |

## Error Handling

| Error | Action |
|-------|--------|
| Git not clean | Report dirty files, ask user to commit/stash |
| No issues found | Report and suggest how to label issues |
| Circular dependencies | Report cycle, ask user to resolve |
| gh CLI missing | Report error, link to installation |
