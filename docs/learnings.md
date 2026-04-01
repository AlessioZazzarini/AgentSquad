# Battle-Tested Learnings

24 lessons from production autonomous AI development. Each one was learned the hard way.

---

## 1. Three-Layer Session Isolation

**Problem:** Loop hooks firing in normal Claude Code sessions, or one worker's hook affecting another.

**Solution:** Three isolation layers:
1. **Environment variable** (`AGENTSQUAD_LOOP_ENABLED=1`) -- only set in worker sessions. The hook checks this first and exits immediately if unset. Zero overhead for normal sessions.
2. **State file** (`.claude/loop.local.md`) -- tracks which loop is active, its session ID, iteration count, and completion promise.
3. **Session ID** -- the hook compares the current session ID against the one in the state file. Only the session that started the loop can be stopped by the hook.

---

## 2. 7-Point Taskmaster Compliance

**Problem:** Autonomous workers stopping prematurely with "I think we're done" before actually completing the task.

**Solution:** A compliance checklist injected into every iteration's stop hook output. The worker must satisfy all 7 points before stopping:
1. All acceptance criteria met
2. Build and tests pass
3. Execution log up to date
4. Status updated via script
5. No unresolved blockers
6. Completion promise fulfilled
7. PR created (if applicable)

Additionally, specific phrases are banned: "I'll stop here", "This should be enough", "I think we're done", "Let me wrap up".

---

## 3. Completion Promise Must Be EXACT Match

**Problem:** Workers updating status to similar-but-wrong values (e.g., "ready" instead of "ready-for-review") and the hook accepting it.

**Solution:** The completion promise check uses exact string matching against `status.json`. The promise is set at spawn time (e.g., `--completion-promise "ready-for-review"`) and checked literally. No fuzzy matching, no partial matches.

---

## 4. Cap at Last 100 Assistant Lines for jq Parsing

**Problem:** The stop hook parsing Claude's transcript to check compliance. Large transcripts caused jq to fail or run extremely slowly.

**Solution:** Only parse the last 100 lines of assistant output. This is sufficient to check the most recent iteration's compliance while keeping parsing fast and reliable.

---

## 5. Perl for Multiline Tag Extraction

**Problem:** Extracting content from multiline XML-like tags (e.g., `<completion-check>...</completion-check>`) in shell. `grep` and `sed` fail on multiline patterns.

**Solution:** Use Perl with the `-0777` flag for slurp mode:
```bash
perl -0777 -ne 'print $1 if /<tag>(.*?)<\/tag>/s'
```

---

## 6. `export $()` Is the Most Dangerous Pattern

**Problem:** `export VAR=$(command)` silently masks the command's exit code. If the command fails, the export succeeds (exit code 0) and `VAR` is set to empty string. With `set -e`, the script continues instead of failing.

**Solution:** Always separate assignment and export:
```bash
VALUE=$(command)   # This can fail and trigger set -e
export VALUE
```

---

## 7. Bare `export` Dumps All Environment Variables

**Problem:** Running `export` with no arguments in a script dumps every environment variable to stdout, potentially exposing secrets.

**Solution:** Never use bare `export`. Always specify the variable name. In security-sensitive contexts, redirect stdout to `/dev/null` as defense in depth.

---

## 8. Safe Deletion Allowlist for Build Artifacts

**Problem:** Workers running `rm -rf` on directories they should not touch, sometimes deleting source code or dependencies.

**Solution:** Maintain an explicit allowlist of paths that are safe to delete (e.g., `.next/`, `dist/`, `node_modules/.cache/`). Any deletion outside the allowlist requires human approval.

---

## 9. `git reset --hard` Without Target Is Always Dangerous

**Problem:** Workers running `git reset --hard` to clean up, which discards all uncommitted changes including untracked files that might be important.

**Solution:** Never allow `git reset --hard` without an explicit target commit. Prefer `git stash` for temporary cleanup or `git checkout -- <file>` for specific file resets.

---

## 10. Must Use Opus Model for Workers

**Problem:** Workers spawned with Sonnet running out of context on medium and high complexity tasks. They would lose track of acceptance criteria, repeat work, or fail to connect earlier findings to later steps.

**Solution:** Always spawn workers with `--model claude-opus-4-6`. The larger context window is essential for autonomous work where the model needs to hold task context, execution history, and codebase knowledge simultaneously.

---

## 11. Sleep 8 Seconds After tmux Window Creation

**Problem:** Sending commands to a new tmux window immediately after creation. Claude Code had not finished initializing, so the commands were lost or partially received.

**Solution:** `sleep 8` after `tmux new-window` before `tmux send-keys`. 5 seconds was not enough; 8 seconds is reliable across different machines. This accounts for Claude Code's startup time including model loading.

---

## 12. Complexity-to-Iteration Budget Mapping

**Problem:** Workers running forever on simple tasks or giving up too early on complex ones. Fixed iteration limits did not fit all tasks.

**Solution:** Map complexity to iterations: simple=15, medium=20, high=30. These numbers are calibrated from real production usage. Simple tasks rarely need more than 10 iterations; high-complexity tasks regularly use 20+. Allow per-task override as a second argument.

---

## 13. Status Updates ONLY via Script

**Problem:** Workers editing `status.json` directly with `jq` or text editors, sometimes creating malformed JSON or missing the `updated_at` timestamp.

**Solution:** All status updates must go through `update-status.sh`. The script handles type coercion, timestamp updates, path validation, and notification triggers. Direct edits are explicitly forbidden in worker prompts.

---

## 14. Acceptance Criteria Are Mandatory

**Problem:** Workers spawned without acceptance criteria wandering aimlessly, implementing random improvements, or stopping after trivial changes.

**Solution:** Every task must have `acceptance-criteria.md`. Without it, the worker has no definition of done and cannot satisfy the compliance checklist. The spawn script warns if the file is missing and provides a fallback instruction to generate criteria from the task description.

---

## 15. Delete Stale Auth Cookies Before E2E

**Problem:** E2E tests failing because they picked up stale authentication cookies from a previous session, causing auth conflicts or expired token errors.

**Solution:** Clear browser state (cookies, local storage) before each E2E test run. In Playwright, use `context.clearCookies()` or create a fresh browser context per test.

---

## 16. Two-Phase Orchestration Prevents Context Rot

**Problem:** Orchestrating multiple issues in a single Claude session. By the third or fourth issue, the context was so full of previous issue details that the model made mistakes.

**Solution:** Two-phase approach: Phase 1 triages ALL issues (reads them, sorts dependencies, plans execution order). Phase 2 spawns separate workers for each issue. Each worker gets a fresh Claude session with only its own task context.

---

## 17. Fresh Claude Sessions Per Issue

**Problem:** Reusing a single Claude session for multiple sequential tasks. Earlier task context bled into later tasks, causing the model to apply fixes from one task to another.

**Solution:** Each issue gets its own tmux window with a fresh Claude Code instance. No context reuse between tasks. This is more expensive but dramatically more reliable.

---

## 18. Topological Sort with Cycle Detection for Dependencies

**Problem:** Issues with circular dependencies causing the orchestrator to loop forever or deadlock waiting for prerequisites that could never be satisfied.

**Solution:** Build a dependency graph and run topological sort before spawning any workers. If cycles are detected, report them to the user and skip the affected issues. Never attempt to break cycles automatically.

---

## 19. Unset API Keys Before Calling Secondary Model

**Problem:** The secondary model (Codex) accidentally using the project's OpenAI API key instead of subscription auth, causing unexpected billing.

**Solution:** The bridge script explicitly runs `unset OPENAI_API_KEY` before invoking the secondary CLI. This forces the CLI to fall back to its own authentication (typically `~/.codex/auth.json` for subscription mode).

---

## 20. Think Mode Sync, Build Mode Async

**Problem:** Running Think mode in the background. By the time the response was read, the conversation had moved on and the context for the debate was lost.

**Solution:** Think mode is always synchronous -- you need the response immediately to reason about it. Build mode is always asynchronous -- the secondary model works independently while you continue talking to the user.

---

## 21. Never Overlap Files Between Models

**Problem:** Both Claude and Codex modifying the same file simultaneously. Git conflicts, lost changes, or inconsistent state.

**Solution:** Build specs must include an explicit "DO NOT TOUCH" list. If both models need the same file, work sequentially -- never in parallel. The primary model owns the file until it explicitly hands it off.

---

## 22. Synthesize, Don't Relay Cross-Model Output

**Problem:** Pasting raw Codex output to the user. It was verbose, sometimes wrong, and filled the context window with noise.

**Solution:** After every cross-model call: read the full response, reason about it internally, write a 3-5 bullet point summary, and use only that summary going forward. Never paste raw output to the user.

---

## 23. Debounce Session Metrics at 30 Seconds

**Problem:** Metrics and status updates firing too frequently during rapid iteration, causing notification spam and status.json churn.

**Solution:** Debounce status-change notifications at 30 seconds. If the status changes multiple times within 30 seconds, only the final state triggers a notification. The status.json file itself is still updated immediately (for monitoring), but notifications are debounced.

---

## 24. File Size Check Before Re-Parsing Transcript

**Problem:** The stop hook re-parsing the entire Claude transcript on every iteration. As transcripts grew to hundreds of KB, parsing became slow.

**Solution:** Check the transcript file size before parsing. If it exceeds a threshold (e.g., 100KB), only read the tail. Combined with lesson #4 (cap at last 100 assistant lines), this keeps hook execution under 1 second.
