# Getting Started

Set up AgentSquad in your project in under 2 minutes.

## Prerequisites

- Node.js 18+
- Claude Code CLI (`claude`)
- tmux
- jq
- gh (GitHub CLI)

## Install

```bash
cd your-project
npx agentsquad init
```

The init wizard asks for your project name, build/test/lint commands, and main branch. It then:

1. Creates `.tasks/` directory (your task repository)
2. Copies core scripts to `scripts/agentsquad/`
3. Updates `.claude/settings.json` with AgentSquad permissions
4. Creates `.claude/agentsquad.json` with your project config
5. Adds `.claude/loop.local.md` to `.gitignore`

## Add the Shell Alias

```bash
alias squadmode='AGENTSQUAD_LOOP_ENABLED=1 claude --model claude-opus-4-6 --dangerously-skip-permissions'
```

Add this to your `~/.zshrc` or `~/.bashrc`.

## Verify Setup

```bash
agentsquad doctor
```

This checks all dependencies and configuration.

## Create Your First Task

```bash
mkdir -p .tasks/my-first-task
```

Create `.tasks/my-first-task/status.json`:
```json
{
  "status": "ready",
  "complexity": "simple",
  "priority": "P1",
  "type": "implement"
}
```

Create `.tasks/my-first-task/acceptance-criteria.md`:
```markdown
# My First Task

## Acceptance Criteria
- [ ] The thing works
- [ ] Tests pass
- [ ] No regressions
```

## Spawn a Worker

Start a tmux session first:
```bash
tmux new-session -s my-project
```

Then spawn a worker:
```bash
bash scripts/agentsquad/spawn-worker.sh my-first-task
```

## Monitor Progress

Check worker status:
```bash
bash scripts/agentsquad/check-workers.sh
```

Watch the execution log in real time:
```bash
tail -f .tasks/my-first-task/execution-log.md
```

## Next Steps

- Read [Concepts](concepts.md) to understand the methodology
- Read [Configuration](configuration.md) to customize your setup
- Install [Packs](packs.md) for additional capabilities
