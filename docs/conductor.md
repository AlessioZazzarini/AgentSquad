# Conductor — Continuous Orchestration

The Conductor watches your task queue and autonomously manages workers. Each cycle it:

1. **Finalizes** completed workers (push branch, create PR)
2. **Checks health** (nudge stuck workers, kill timed-out ones)
3. **Spawns new workers** for the next available task (up to `AGENTSQUAD_MAX_WORKERS`)

Three strategies for running it, from simplest to most automated.

---

## Strategy 1: Manual (default)

Run `/conductor` inside any Claude Code session whenever you want a cycle. No setup required. Good for getting started or when you want full control over timing.

```
/conductor
```

---

## Strategy 2: tmux + /loop (recommended for solo devs)

Run the Conductor in a dedicated tmux session that executes one `/conductor` cycle every 5 minutes.

### Setup

```bash
# Start a detached tmux session in your project directory
tmux new-session -d -s conductor -c /path/to/project

# Launch Claude Code with permissions (required for autonomous operation)
tmux send-keys -t conductor 'AGENTSQUAD_LOOP_ENABLED=1 claude --dangerously-skip-permissions' Enter

# Wait for Claude to initialize
sleep 12

# Start the loop — one conductor cycle every 5 minutes
tmux send-keys -t conductor '/loop 5m /conductor' Enter
```

### How it works

- The conductor session runs `/conductor` every 5 minutes on the clock.
- Each cycle checks for completed workers, monitors health, and spawns new workers as capacity allows.
- Workers are spawned as **separate tmux windows** (not inside the conductor session). The conductor only manages their lifecycle.
- The conductor uses `AGENTSQUAD_LOOP_ENABLED=1` to enable the loop methodology. Workers inherit their own loop state independently.

### Monitoring

```bash
# Attach to watch the conductor live
tmux attach -t conductor

# Detach without stopping: Ctrl+B, then D

# List all tmux sessions (conductor + worker windows)
tmux list-sessions
tmux list-windows -t conductor
```

### Stopping

```bash
# Stop the conductor (workers already running will finish their current iteration)
tmux kill-session -t conductor
```

### What happens on sleep/reboot

If the machine sleeps or reboots, the conductor stops. tmux sessions do not survive reboots. You must restart manually.

For reboot persistence, you could use **launchd** (macOS) or **systemd** (Linux) to re-launch the tmux session on boot. This is a potential v0.3 improvement — not shipped yet.

---

## Strategy 3: GitHub Actions (triage-only)

GitHub Actions can handle the **triage** part of orchestration (scanning issues, labeling, updating the manifest) but it **cannot** spawn local tmux workers. Workers require a local machine with Claude Code installed.

### The hybrid approach

1. **GitHub Actions** runs every 15 minutes via cron. It scans for new issues with the `squad:ready` label, parses dependency chains, and posts status comments. See `packs/github/workflows/conductor-triage.yml`.
2. **Local conductor** (Strategy 2) picks up labeled issues and spawns workers on your machine.

This is useful when you want issue triage to happen even when your laptop is off, so that work is queued and ready when you come online.

### Installation

Copy the workflow template into your project:

```bash
mkdir -p .github/workflows
cp packs/github/workflows/conductor-triage.yml .github/workflows/
```

Then push to your repository. The workflow triggers on:
- **Schedule**: every 15 minutes
- **Issue labeled**: whenever an issue gets a new label
- **Manual**: via the Actions tab (workflow_dispatch)

---

## Security notes

- **`--dangerously-skip-permissions`** is required for autonomous worker operation. Only use this on repositories you trust. Workers execute code — a malicious issue body could become a shell command if guardrails are bypassed.
- **`core/scripts/lib/guardrails.sh`** validates task inputs before they reach workers. Do not disable it.
- **GitHub tokens** should be scoped tightly. The triage workflow only needs `issues: write` and `contents: read`. Do not grant broader permissions than necessary.
- **Never let untrusted issue content become shell commands.** The orchestrator passes issue metadata through structured files (acceptance-criteria.md), not raw shell interpolation. Keep it that way.
