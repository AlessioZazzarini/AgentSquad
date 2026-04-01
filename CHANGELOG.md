# Changelog

All notable changes to AgentSquad are documented here. This changelog also serves as a design journal — recording not just what changed, but why, what alternatives were considered, and what was learned.

## [0.3.0] — 2026-04-01 — Notifications + Dual-Mode Approval

### What's new
- Real Telegram notifications (was stub)
- Real Slack notifications (was stub)
- Auto-detect notification channel from config
- Dual-mode approval: manual (human gate) vs auto (CI + policy)
- New status states: review-ready, approved, merged
- pr-review.md required before completion
- Cycle summary notifications
- Global kill switch ("paused" mode)

### Designed with Codex (gpt-5.4)
Codex key insight: same state machine for both modes. Only difference is who advances review-ready -> approved. Sensitive paths force manual regardless of setting.

---

## [0.2.0] — 2026-04-01 — Conductor (Continuous Orchestrator)

### What's new
The Conductor is a continuous orchestrator that watches the task queue and autonomously manages workers. Instead of batch processing all issues at once, it runs one cycle every 5 minutes.

### Execution strategies
Three strategies were evaluated with Codex (gpt-5.4):
- **tmux + /loop** (shipped) — fast, subscription-based, runs locally
- **GitHub Actions** (shipped, triage-only) — serverless, can't spawn local workers
- **Local daemon** (designed, not shipped) — launchd/systemd, future v0.3

### New files
- `core/commands/conductor.md` — `/conductor` slash command
- `core/scripts/conductor.sh` — bash helper (status/finalize/health/spawn-next)
- `packs/github/workflows/conductor-triage.yml` — GH Actions template
- `docs/conductor.md` — setup guide for all 3 strategies

### Key design decision
Workers stop at `ready-for-review`. The Conductor handles push + PR creation. This keeps workers simple (code only) and centralizes git/GitHub operations.

---

## [0.1.2] — 2026-04-01 — Post-E2E Fixes

### What happened
Ran first real E2E test on a Python Flask project (squad-test-app). The test created 3 GitHub issues with a dependency chain and ran the full orchestration pipeline. Found 7 issues, fixed all of them.

### Codex collaboration
Codex (gpt-5.4) reviewed the E2E findings and identified 4 additional structural problems we'd missed:
1. The GitHub pack was **overriding** the core `/orchestrate` command with a simpler version that lacked worktree support — this was the root cause of the parallel worker contamination
2. Branch naming was inconsistent across 3 scripts (`task/<id>` vs `squad/issue-<N>`)
3. Config values collected during `init` were stored but never read by any script
4. The status model had a semantic mismatch: worker stopped at `ready-for-review` but docs said PR must exist first

### Changes
- **GitHub pack**: No longer overrides `/orchestrate`. Now adds only labels + `close-task.sh`. Orchestration delegates to `orchestrate-parallel.sh`.
- **Config reader**: New `core/scripts/lib/config.sh` — reads `.claude/agentsquad.json` and exports all settings. Sourced by `spawn-worker.sh` and `orchestrate-parallel.sh`.
- **Branch naming**: Standardized to `task/issue-<N>` everywhere.
- **Templates**: Replaced all `npm run build/test/e2e` with `{{BUILD_CMD}}/{{TEST_CMD}}/{{E2E_CMD}}` placeholders.
- **spawn-worker.sh**: Now accepts `AGENTSQUAD_WORKDIR` for worktree support, injects configured commands into worker prompt.
- **Status model**: Worker stops at `ready-for-review` (code done). Orchestrator handles push + PR, then sets `pr-created`.
- **Docs**: Fixed lifecycle diagram, removed last "Ralph" reference.

### Design decisions
- **Why not make spawn-worker.sh create worktrees?** Codex argued (correctly) that isolation is the orchestrator's responsibility, not the worker launcher's. Workers should be dumb launchers; orchestrators own branch strategy.
- **Why a shared config reader?** Multiple scripts need the same values. A single source of truth prevents drift.

---

## [0.1.1] — 2026-04-01 — E2E Test + Hotfixes

### What happened
First E2E test of AgentSquad on a real project. Created `squad-test-app` (Python Flask REST API), installed AgentSquad, created 3 GitHub issues, and ran the full orchestration pipeline.

### Results
- 3 features built autonomously in 8.5 minutes across 2 waves
- Wave 1: Issue #1 (app skeleton) — completed in ~2 min, 7/7 tests
- Wave 2: Issues #2 + #3 (SQLite + search/filter) — parallel, completed in ~3.5 min, 35/35 tests
- All workers completed in 1 iteration (compliance enforcement worked)

### Bugs found and fixed
1. **`spawn-worker.sh` used `/ralph-start`** — incomplete rename from extraction. Fixed.
2. **`agentsquad init` didn't copy core files** — only created `.tasks/` and scripts, missing hooks, templates, commands, skills, agents. Fixed by adding steps 5-12 to the CLI.
3. **Non-interactive mode missing** — readline doesn't work with piped stdin. Added `--yes` flag + env var support.

### Full report
See `docs/e2e-test-report.md` for the complete 218-line test report with timeline, per-issue metrics, and all 8 recommendations.

---

## [0.1.0] — 2026-04-01 — Initial Release

### Origin
AgentSquad was extracted from the Roger project (an AI marketing twin for Web3 founders). Over several months of production use, we built an autonomous development pipeline on top of Claude Code that could plan, implement, and debug features autonomously. The system was battle-tested through dozens of bug fixes and feature implementations.

The extraction was done in a single session with 4 parallel build agents + Codex collaboration.

### Architecture decisions

**Why extract at all?**
The system was tightly coupled to Roger (agent names like `val-voice`, `sam-systems`, Roger-specific skills, hardcoded paths). Making it portable means any project can benefit from the methodology.

**Why flat repo, not monorepo?**
Codex proposed a monorepo with `packages/cli`, `packages/core`, `adapter-claude`, `adapter-codex`. I overruled this — the system is ~60 files of shell scripts + markdown. A monorepo adds complexity without value. The product IS the generated files; the CLI is just a scaffolder.

**Why packs, not plugins?**
Some features (GitHub orchestration, Vercel previews, cross-model collaboration) aren't universal. Packs are optional directories that `agentsquad add <pack>` copies into your project. No npm dependencies, no build step, no runtime overhead.

**Why `.tasks/` not `.bugs/`?**
Roger used `.bugs/` because it started as a bug-fixing system. AgentSquad generalizes to features, bugs, chores, and research via a `kind` field in `status.json`.

### Codex pressure test
Before release, Codex (gpt-5.4) was asked to adversarially review the parallel orchestration engine. It found 10 issues:

1. **Shared git worktree** → Fixed: each worker gets `git worktree`
2. **Shared `.tasks/` session files** → Fixed: namespaced per issue
3. **Manifest race condition** → Fixed: `flock` + `$BASHPID`
4. **Torn multi-writes** → Fixed: single `jq` call with `|=`
5. **stdout contamination in wave computation** → Fixed: log to stderr
6. **Dependency code unavailable** → Fixed: merge dependency branches
7. **Crash recovery broken** → Fixed: reset `in_progress` → `queued` on startup
8. **No orchestration lock** → Fixed: PID lockfile
9. **Fragile polling loop** → Fixed: `wait -n` + associative array
10. **loop.sh exits 0 on max iterations** → Documented

### What's included
- **Core**: 4 hooks, 7 templates, 6 commands, 3 skills, 4 agent archetypes, 5 scripts
- **Packs**: collab, github, vercel, supabase, notifications
- **Docs**: 8 guides + 24 battle-tested lessons
- **CLI**: `agentsquad init`, `agentsquad add <pack>`, `agentsquad doctor`

### Credits
- Architecture: Claude Opus 4.6
- Adversarial review: Codex gpt-5.4
- Production testing ground: Roger project
