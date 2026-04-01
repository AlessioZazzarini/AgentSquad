# AgentSquad E2E Test Report — Run 3 (Conductor + Collab)

**Date:** 2026-04-01
**Version:** 0.2.0 (commit d80bb9d)
**Test Project:** [AlessioZazzarini/squad-test-app](https://github.com/AlessioZazzarini/squad-test-app)
**Model:** Claude Opus 4.6 (Claude Max subscription)
**Conductor Mode:** tmux + `/loop 3m /conductor`

---

## Objective

1. Validate the Conductor (continuous orchestrator) running via `/loop`
2. Test dependency-chain execution (sequential: #7 → #8 → #9)
3. Test that workers use `/collab` for complex security-sensitive tasks
4. Measure Conductor cycle efficiency and worker health monitoring

---

## Test Setup

### Issues (sequential dependency chain)

| # | Title | Complexity | Depends On |
|---|-------|-----------|------------|
| 7 | Input validation and error handling | medium | none |
| 8 | JWT authentication with middleware | **high** | #7 |
| 9 | Rate limiting middleware | medium | #8 |

Expected execution: #7 first → #8 after #7 completes → #9 after #8 completes.

Issue #8 explicitly instructs the worker to use `/collab-review` (security-sensitive code).

### Packs Installed

- `github` — labels, close-task
- `collab` — cross-model collaboration bridge

---

## Timeline

| Time | Event |
|------|-------|
| 16:15 | Conductor started via `/loop 3m /conductor` |
| 16:16 | Cycle 1: "All quiet — no tasks ready" (task dirs not yet created) |
| 16:17 | Task directories created for issues #7, #8, #9 |
| 16:18 | Cycle 2: **Spawned workers for #7, #8, AND #9 simultaneously** |
| 16:19 | Issue #7 worker: investigating → implementing |
| 16:19 | Issue #8 worker: noticed dependency not met, built CRUD + JWT anyway |
| 16:19 | Issue #9 worker: started implementing rate limiting |
| 16:21 | Issue #7: `ready-for-review` (completed in ~3 min) |
| 16:21 | Issue #8: `testing-local` |
| 16:21 | Issue #9: `implementing` |
| 16:24 | Conductor finalized issue-7: pushed branch, set `pr-created`, updated labels |
| 16:24 | Issues #8 and #9: `blocked` (max attempts exceeded due to test failures) |

**Total time: ~9 minutes** (but only #7 fully completed correctly)

---

## Results

### Conductor Performance

| Metric | Value | Assessment |
|--------|-------|-----------|
| Cycle interval | 3 minutes | Configured correctly |
| Cycles executed | ~3 | Working |
| Tasks detected | 3/3 | Correct |
| Workers spawned | 3 | **BUG: Should have been 1 (deps not checked)** |
| Finalizations | 1 (#7) | Conductor finalize flow worked |
| Branch pushed | Yes (#7) | Correct |
| PR created | **No** | **BUG: PR creation failed silently** |
| Label updates | Yes (`squad:complete` on #7) | Working |
| Health monitoring | Workers killed after blocking | Working |

### Per-Issue Results

| Issue | Status | Duration | Tests | Collab Used? | Notes |
|-------|--------|----------|-------|-------------|-------|
| #7 | pr-created | ~3 min | 45 pass, 2 fail | No | 2 failing tests from #8/#9 code bleeding in |
| #8 | blocked | ~5 min | — | **No** | Built its own CRUD because #7 wasn't done |
| #9 | blocked | ~5 min | — | No | Started before #8 was ready |

---

## Findings

### Finding #1: CRITICAL — Conductor spawn-next Ignores Dependencies

**What happened:** The Conductor spawned ALL 3 workers simultaneously despite the sequential dependency chain (#7 → #8 → #9). Workers for #8 and #9 started before their dependencies completed.

**Root cause:** `conductor.sh spawn-next` only checks `status: "ready"` but does NOT verify the `dependencies` array. The dependency checking logic exists in `orchestrate-parallel.sh` (the `deps_met()` function) but was not replicated in `conductor.sh`.

**Impact:** Workers attempt tasks without prerequisite code, leading to:
- Duplicate work (issue-8 rebuilt CRUD endpoints that issue-7 was building)
- Test failures (code depends on missing modules)
- Wasted iterations → tasks blocked

**Fix:** Add dependency checking to `conductor.sh spawn-next`:
```bash
# Before spawning, check all dependencies are complete
DEPS=$(jq -r '.dependencies // [] | .[]' "$status_file")
ALL_MET=true
for dep in $DEPS; do
  DEP_STATUS=$(jq -r '.status' "$TASKS_DIR/issue-$dep/status.json" 2>/dev/null)
  if [[ "$DEP_STATUS" != "pr-created" && "$DEP_STATUS" != "complete" ]]; then
    ALL_MET=false; break
  fi
done
$ALL_MET || continue
```

### Finding #2: HIGH — PR Creation Failed Silently

**What happened:** Conductor set status to `pr-created` but no actual PR was created on GitHub. The branch was pushed successfully to `origin/task/issue-7` but `gh pr create` failed or wasn't called.

**Root cause:** The `conductor.sh finalize` subcommand may have hit an error in `gh pr create` that was suppressed by `2>/dev/null`. The idempotent check (`gh pr view`) also may have returned empty without creating.

**Impact:** Status says `pr-created` but no PR exists — misleading state.

**Fix:**
1. Remove `2>/dev/null` from `gh pr create` — let errors surface
2. Verify PR_URL is non-empty before updating status
3. Log the actual `gh` output for debugging

### Finding #3: HIGH — Workers Did Not Use /collab

**What happened:** Issue #8 (JWT authentication, marked as security-sensitive, explicitly requiring `/collab-review`) did NOT use Codex for review. The execution log shows no mention of collab/codex/review.

**Root cause:** Two factors:
1. The worker was racing against unmet dependencies and got blocked before reaching the review step
2. The `/collab` instructions in the worker prompt are advisory, not enforced. Nothing in the compliance checklist gates on collab usage.

**Impact:** Security-sensitive code shipped without cross-model review.

**Fix options:**
- **Option A (soft):** Add "Used /collab-review for security-sensitive code" as a checklist item in the completion promise
- **Option B (hard):** For tasks with `complexity: high`, add a guardrail that checks the execution log for `/collab` usage before allowing `ready-for-review` status

### Finding #4: MEDIUM — Cross-Contamination Despite Worktrees

**What happened:** The issue-7 branch contains `test_auth.py` and `test_rate_limit.py` — code from issues #8 and #9. This means the workers shared a working directory despite having separate branches.

**Root cause:** The Conductor used `spawn-worker.sh` directly (which runs in `PROJECT_ROOT`), NOT `orchestrate-parallel.sh` (which creates worktrees). The Conductor doesn't create worktrees — it relies on spawn-worker.sh, which works in the shared project root.

**Impact:** Same as Run 1's F1 — branches contain code from other workers.

**Fix:** Conductor must create worktrees before spawning workers, or delegate to `orchestrate-parallel.sh` for the full lifecycle.

### Finding #5: LOW — No Execution Log for Issue #9

**What happened:** Issue #9's execution log is empty or minimal — the worker started but got blocked quickly.

**Impact:** Low — the worker correctly identified it was blocked and stopped.

---

## What Worked Well

1. **Conductor `/loop` cycle** — ran every 3 minutes as configured, detected tasks, spawned workers
2. **Task detection** — Conductor correctly found all 3 tasks from `.tasks/*/status.json`
3. **Worker prompt with commands** — workers used `python3 -m pytest` (configured, not hardcoded)
4. **Finalization flow** — Conductor detected `ready-for-review`, pushed branch, updated labels
5. **Health monitoring** — blocked workers were detected and stopped
6. **Status tracking** — `update-status.sh` correctly tracked state transitions
7. **Worker adaptation** — Issue #8 worker intelligently adapted to missing dependency code (not ideal, but resilient)

---

## Comparison: Run 2 vs Run 3

| Aspect | Run 2 (orchestrate-parallel.sh) | Run 3 (Conductor + /loop) |
|--------|-------------------------------|--------------------------|
| Trigger | Manual (`/orchestrate`) | Automatic (`/loop 3m`) |
| Dependency enforcement | **Yes** (deps_met function) | **No** (missing in conductor.sh) |
| Git isolation | **Yes** (worktrees) | **No** (shared workdir) |
| PR creation | **Yes** (3/3 PRs) | **Partial** (pushed but no PR) |
| Worker spawning | Wave-based | On-demand (per cycle) |
| Health monitoring | None | **Yes** (age-based) |
| Collab usage | N/A | **Not triggered** |

**Key insight:** The Conductor is architecturally sound but missing two critical features that `orchestrate-parallel.sh` already has: dependency checking and worktree isolation.

---

## Recommendations

### P0 — Must Fix

1. **Add dependency checking to conductor.sh spawn-next** — Port `deps_met()` from orchestrate-parallel.sh
2. **Add worktree creation to Conductor** — Either the Conductor creates worktrees before spawning, or it calls orchestrate-parallel.sh for the spawn step
3. **Fix PR creation in conductor.sh finalize** — Remove error suppression, verify PR_URL is real

### P1 — Important

4. **Enforce /collab for high-complexity tasks** — Add to compliance checklist or as a guardrail
5. **Extract shared dependency logic** — Both orchestrate-parallel.sh and conductor.sh need deps_met(). Put it in lib/deps.sh.

### P2 — Nice to Have

6. **Conductor dry-run mode** — `/conductor --dry-run` to see what it would do without spawning
7. **Conductor cycle counter** — Track how many cycles have run, log in execution report

---

## Verdict

The Conductor's **control loop works** — it cycles, detects tasks, spawns workers, monitors health, and finalizes completions. But it's missing two critical features from the batch orchestrator: **dependency checking** and **git worktree isolation**. These must be ported before the Conductor is production-ready.

**Collab integration was not tested** because workers got blocked before reaching the review step. A clean dependency chain run is needed to properly test this.

**Next step:** Fix dependency checking + worktree support in conductor.sh, then re-run with the same 3-issue chain.
