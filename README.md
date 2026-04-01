# AgentSquad

Autonomous AI development toolkit for Claude Code. AgentSquad gives Claude Code a safe, completion-enforcing runtime for autonomous task execution -- structured task repositories, worker spawning, compliance enforcement, multi-agent teams, and cross-model collaboration. Battle-tested across 24 lessons from production use.

## Quick Install

```bash
cd your-project
npx agentsquad init
```

## What You Get

- **Task repository** (`.tasks/`) — structured file-based tracking with status.json, acceptance criteria, execution logs
- **Worker spawning** — tmux-based autonomous Claude Code workers with iteration budgets
- **Status updates** — safe jq-based JSON mutations with path traversal validation
- **Worker monitoring** — JSON output of all active workers and their health
- **Notifications** — webhook-based alerts on status transitions (Slack, Discord, generic)
- **Compliance enforcement** — 7-point anti-premature-stopping checklist every iteration
- **Cross-model collaboration** — delegate to a secondary model (Codex, etc.) for think/build/debug

## How It Works

AgentSquad uses a **loop methodology** where Claude Code runs autonomously inside a structured framework:

1. **Task files** define what to do (acceptance criteria, environment, interfaces)
2. **Workers** are spawned in tmux windows, each with a dynamically built prompt
3. **Status tracking** happens via scripts (never direct JSON edits) for safety
4. **Compliance hooks** prevent premature stopping, context rot, and scope creep
5. **Notifications** keep you informed via webhooks

### Task Types

| Type | Purpose |
|------|---------|
| **Plan** | Architecture, design, research — produces a plan document |
| **Implement** | Build features, fix bugs — produces code + tests + PR |
| **Debug** | Investigate and fix issues — hypothesis-driven with execution log |

### The 3-File System

Every task in `.tasks/<task-id>/` has:

| File | Purpose |
|------|---------|
| `status.json` | Machine-readable state (status, complexity, attempts, timestamps) |
| `acceptance-criteria.md` | What "done" looks like — the worker's contract |
| `execution-log.md` | Real-time progress log — you monitor this |

Optional files: `environment.md` (task-specific env setup), `screenshots/`, `.worker-prompt.md` (auto-generated).

### Compliance Enforcement

The loop framework injects a **7-point anti-premature-stopping checklist** every iteration:

1. Are all acceptance criteria met?
2. Do build and tests pass?
3. Is the execution log up to date?
4. Has status been updated via the script?
5. Are there no unresolved blockers?
6. Has the completion promise been fulfilled?
7. Is there any remaining work you haven't attempted?

Workers cannot stop until all 7 points are satisfied. Push and PR creation happen after worker completion (handled by the orchestrator).

### Continuous Orchestration (Conductor)

The Conductor watches your task queue and autonomously manages workers:

```bash
# Run one cycle manually
/conductor

# Run continuously (every 5 minutes)
/loop 5m /conductor
```

Each cycle: finalizes completed workers (push + PR), checks health (nudge/kill stuck), spawns new workers (up to MAX_WORKERS). See [docs/conductor.md](docs/conductor.md).

### Multi-Agent Teams

For complex tasks spanning multiple domains, spawn specialist agents:

```
| Files touched       | Agent suggestion          |
|---------------------|---------------------------|
| src/lib/ai/**       | voice/AI specialist       |
| src/components/**   | UI/frontend specialist    |
| src/lib/api/**      | systems/backend specialist|
| **/*.test.*         | QA/testing specialist     |
```

Define agents in `.claude/agents/` with paired skills in `.claude/skills/`.

## Optional Packs

Install additional capabilities:

```bash
agentsquad add collab          # Cross-model collaboration (think/build/debug)
agentsquad add github          # GitHub issue orchestration with label management
agentsquad add vercel          # Vercel preview deployment + E2E testing
agentsquad add notifications   # Slack and Telegram notification scripts
agentsquad add supabase        # Supabase branch database management
```

## Complexity Budgets

Workers get iteration budgets based on task complexity:

| Complexity | Max Iterations |
|-----------|---------------|
| simple    | 15            |
| medium    | 20            |
| high      | 30            |

Override per-task: `spawn-worker.sh <task-id> 40`

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENTSQUAD_TASKS_DIR` | `.tasks` | Task repository directory |
| `AGENTSQUAD_TMUX_SESSION` | project dirname | tmux session name |
| `AGENTSQUAD_NOTIFY_WEBHOOK` | (none) | Webhook URL for notifications |
| `AGENTSQUAD_MAX_WORKERS` | 3 | Max concurrent workers |
| `AGENTSQUAD_SECONDARY_MODEL` | gpt-5.4 | Model for collab pack |
| `AGENTSQUAD_SECONDARY_CLI` | codex | CLI command for collab pack |

## Battle-Tested

AgentSquad encodes 24 hard-won lessons from production autonomous development. See [docs/learnings.md](docs/learnings.md) for the full list, including:

- Three-layer session isolation (env var, state file, session ID)
- `export $()` is the most dangerous shell pattern
- Must use Opus model for workers (Sonnet runs out of context)
- Sleep 8 seconds after tmux window creation
- Fresh Claude sessions per issue (prevents context rot)
- Topological sort with cycle detection for dependencies

## Documentation

- [Getting Started](docs/getting-started.md) — 2-minute quickstart
- [Concepts](docs/concepts.md) — methodology deep-dive
- [Configuration](docs/configuration.md) — settings, hooks, env vars
- [Agents](docs/agents.md) — domain-specific agent definitions
- [Tasks](docs/tasks.md) — task repository format and lifecycle
- [Packs](docs/packs.md) — optional pack system
- [Collab](docs/collab.md) — cross-model collaboration
- [Learnings](docs/learnings.md) — 24 battle-tested lessons

## License

MIT -- Alessio Zazzarini
