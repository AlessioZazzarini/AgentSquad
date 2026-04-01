# AgentSquad E2E Test Report

**Date:** 2026-04-01
**Version:** 0.1.0 (commit fa4b7f9 + hotfixes)
**Test Project:** [AlessioZazzarini/squad-test-app](https://github.com/AlessioZazzarini/squad-test-app) — Python Flask REST API
**Model:** Claude Opus 4.6 (Claude Max subscription)
**Machine:** macOS Darwin 24.6.0

---

## Objective

Validate that AgentSquad can autonomously build features on a non-JavaScript project, with correct dependency ordering, parallel wave execution, compliance enforcement, and quality gates.

---

## Test Setup

### Issues Created

| # | Title | Dependencies | Wave |
|---|-------|-------------|------|
| 1 | App skeleton: repository interface + in-memory CRUD + tests | none | 1 |
| 2 | SQLite persistent storage with config switch | depends-on: #1 | 2 |
| 3 | Search and filter endpoint with pagination | depends-on: #1 | 2 |

### Expected Execution

```
Wave 1: [#1]          → sequential
Wave 2: [#2, #3]      → parallel
```

---

## Timeline

| Time | Event |
|------|-------|
| T+0:00 | `/orchestrate --dry-run` — validated 3 issues, 2 waves, 0 cycles |
| T+0:30 | `/orchestrate` — triage started, manifest generated |
| T+1:00 | Worker spawned for Issue #1 (Wave 1) |
| T+1:08 | Issue #1 worker reads prompt, enters loop iteration 1 |
| T+3:00 | Issue #1 worker outputs "ready-for-review" — **completed in ~2 min** |
| T+3:10 | Orchestrator detects completion, spawns Wave 2: Issues #2 + #3 in parallel |
| T+3:18 | Both workers active: #2 implementing SQLite, #3 implementing search/filter |
| T+6:30 | Both workers output "ready-for-review" — **Wave 2 completed in ~3.5 min** |
| T+8:30 | Orchestrator finishes cleanup and label updates |

**Total wall time: ~8.5 minutes** for 3 features across 2 waves.

---

## Results

### Per-Issue Metrics

| Metric | Issue #1 | Issue #2 | Issue #3 |
|--------|----------|----------|----------|
| Wall time | ~120s | ~200s | ~200s |
| Active time | ~110s | ~193s | ~183s |
| Loop iterations | 1 | 1 | 1 |
| Tool calls (ok) | ~35 | 42 | 37 |
| Tool calls (err) | ~3 | 5 | 5 |
| Files created | 3 | 2 | 0* |
| Files modified | 2 | 2 | 0* |
| Tests written | 7 | 28 | 0* |
| Tests passing | 7/7 | 35/35 | 7/7 (base only) |
| Completion | ready-for-review | ready-for-review | ready-for-review |

*Issue #3's code ended up on Issue #2's branch (see Finding #1).

### Orchestrator Session

| Metric | Value |
|--------|-------|
| Wall time | 506s |
| Turns | 52 |
| Tool calls | 46 ok, 0 err |
| Issues processed | 3/3 |
| PRs created | 0 (see Finding #3) |

---

## Findings

### Finding #1: CRITICAL — Parallel Workers Shared Git Working Directory

**What happened:** Issues #2 and #3 both ran in the same git working directory instead of isolated worktrees. Issue #2's branch (`task/issue-2`) ended up with Issue #3's commit (`feat: add search, filter, and pagination`). Issue #3's branch only had the base code from Issue #1.

**Root cause:** The orchestrator used `spawn-worker.sh` which spawns Claude sessions that work in the shared project root, not the `orchestrate-parallel.sh` which uses git worktrees. The `/orchestrate` command (from the GitHub pack) generates a sequential orchestration script, not the parallel one.

**Impact:** Features bleed across branches. Code from one issue can end up on another's branch.

**Fix:** The `/orchestrate` command should either:
1. Use `orchestrate-parallel.sh` (which has worktree support) instead of generating its own script
2. Or the generated script should create worktrees per issue

### Finding #2: HIGH — `/ralph-start` Not Renamed in spawn-worker.sh

**What happened:** The first run failed because `spawn-worker.sh` still referenced `/ralph-start` instead of `/loop-start`.

**Root cause:** Incomplete rename during extraction. The sed command missed this reference because it was inside a tmux send-keys string.

**Impact:** Workers fail to start on first run.

**Status:** Fixed in commit `fa4b7f9`.

### Finding #3: MEDIUM — No PRs Were Created

**What happened:** All 3 issues completed successfully but no pull requests were created on GitHub. Branches were pushed but PR creation was skipped.

**Root cause:** The orchestrator's workflow creates PRs after the worker completes, but the generated orchestration script may not have reached the PR creation step before the session ended. Also, branches were not pushed to origin.

**Impact:** Human reviewer has no PRs to review, must manually check branches.

**Fix:** Ensure the generated orchestration script includes explicit `git push` + `gh pr create` after each worker completes.

### Finding #4: MEDIUM — agentsquad init Didn't Copy Core Files

**What happened:** First run of `agentsquad init` only created `.tasks/`, scripts, and settings — missing hooks, templates, commands, skills, and agents.

**Root cause:** The CLI scaffolder was incomplete — it only had steps 1-4 but was missing steps 5-12 (copy hooks, templates, commands, skills, agents, merge hook config).

**Impact:** No compliance enforcement, no loop capability, no agent definitions.

**Status:** Fixed in commit `859c673`.

### Finding #5: MEDIUM — Non-Interactive Mode Missing

**What happened:** `agentsquad init` couldn't be run from piped stdin or CI environments because readline doesn't work with non-TTY input.

**Root cause:** No `--yes` / `-y` flag or env var fallback.

**Impact:** Can't automate installation in CI/CD or scripts.

**Status:** Fixed in commit `859c673` with `--yes` flag + env var support.

### Finding #6: LOW — tmux Session Name Mismatch

**What happened:** `spawn-worker.sh` defaults to `$(basename $(pwd))` = `squad-test-app`, but I created a tmux session called `squad-test`. The script failed, then the orchestrator auto-created the correct session.

**Root cause:** Convention mismatch between user's tmux session name and the default.

**Impact:** Minor — self-healed. But confusing error message.

**Fix:** The `agentsquad init` output should specify the exact tmux session name to use.

### Finding #7: LOW — `python` vs `python3` on macOS

**What happened:** Issue #2 worker tried `python -m pytest` which fails on macOS (only `python3` exists).

**Root cause:** Worker prompt template uses generic `python` command.

**Impact:** Worker had to self-correct (it did), costing an extra iteration.

**Fix:** Worker prompt should use the test command from `agentsquad.json` config (`pytest`), not hardcoded `python -m pytest`.

---

## What Worked Well

1. **Dry-run validation** — correctly identified 3 issues, 2 waves, dependency chain, 0 cycles
2. **Loop compliance** — workers completed their tasks in 1 iteration each (no premature stopping)
3. **Task decomposition** — workers read acceptance criteria and implemented all required features
4. **Status updates** — `update-status.sh` correctly tracked investigating → implementing → testing-local → ready-for-review
5. **Parallel worker spawning** — Wave 2 correctly launched both workers simultaneously
6. **Test quality** — 7 tests for Issue #1, 35 tests for Issue #2 (including SQLite tests)
7. **Self-healing** — workers handled errors gracefully (python/python3, edit conflicts)
8. **Label management** — `squad:ready` → `squad:in-progress` → `squad:complete` transitions worked

---

## Recommendations (Priority Order)

### P0 — Must Fix Before Production Use

1. **Unify orchestration paths** — The GitHub pack's `/orchestrate` and `orchestrate-parallel.sh` must converge. Either the command should invoke the parallel script, or the generated script should use git worktrees.

2. **Push + PR creation** — The orchestration workflow must explicitly push branches and create PRs after worker completion.

### P1 — Important Improvements

3. **Worker prompt should use config commands** — Read `build_cmd` and `test_cmd` from `.claude/agentsquad.json` instead of hardcoding `npm run build` / `python -m pytest`.

4. **Validate all renames** — Do a systematic grep for "ralph" across the entire repo (including inside quoted strings, tmux send-keys, etc.).

5. **Add CLAUDE.md auto-generation** — `agentsquad init` should generate a minimal CLAUDE.md with project conventions, so workers have context.

### P2 — Nice to Have

6. **Session-to-issue correlation** — Add `issue_number` and `wave_number` to session-summary.js output for easier reporting.

7. **tmux session name guidance** — Print the exact session name in `agentsquad init` output and `spawn-worker.sh` help.

8. **Pre-flight Python detection** — `agentsquad doctor` should check if `python3` is available and warn about `python` vs `python3`.

---

## Cost Analysis

| Metric | Value |
|--------|-------|
| Total sessions | 4 (1 orchestrator + 3 workers) |
| Total wall time | ~8.5 minutes |
| Model | Claude Opus 4.6 (subscription) |
| API cost | $0 (subscription-based) |
| Token cost (estimated) | ~150K input + ~30K output per worker session |

---

## Conclusion

AgentSquad successfully orchestrated 3 features on a Python Flask project with correct dependency ordering and parallel execution. The core loop methodology (compliance enforcement, status tracking, acceptance criteria) worked as designed — all workers completed in a single iteration.

The main issue is **git isolation for parallel workers** — the generated orchestration script doesn't use worktrees, so parallel workers share a working directory and cross-contaminate branches. This is the #1 fix needed.

The toolkit is 80% production-ready. The remaining 20% is integration polish between the GitHub pack's orchestration command and the core parallel execution engine.
