# Configuration

## Project Config

`agentsquad init` creates `.claude/agentsquad.json`:

```json
{
  "project": "my-app",
  "description": "My awesome app",
  "commands": {
    "build": "npm run build",
    "test": "npm test",
    "e2e": "npx playwright test",
    "lint": "npm run lint"
  },
  "mainBranch": "main",
  "tasksDir": ".tasks",
  "maxWorkers": 3
}
```

## Settings

`.claude/settings.json` gets AgentSquad permissions added during init:

```json
{
  "permissions": {
    "allow": [
      "Bash(scripts/agentsquad/*)",
      "Bash(jq *)",
      "Bash(tmux *)",
      "Bash(gh issue *)",
      "Bash(gh pr *)",
      "Bash(git *)"
    ]
  }
}
```

Add more permissions as needed for your project.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENTSQUAD_TASKS_DIR` | `.tasks` | Task repository directory |
| `AGENTSQUAD_TMUX_SESSION` | project dirname | tmux session name for workers |
| `AGENTSQUAD_NOTIFY_WEBHOOK` | (none) | Webhook URL for notifications |
| `AGENTSQUAD_MAX_WORKERS` | 3 | Max concurrent workers for orchestration |
| `AGENTSQUAD_SECONDARY_MODEL` | gpt-5.4 | Model for collab pack |
| `AGENTSQUAD_SECONDARY_CLI` | codex | CLI command for collab pack |

## Hooks

AgentSquad uses a hook-based compliance system. The key hook is the **stop hook**, which injects the 7-point compliance checklist every iteration.

To enable the loop, set `AGENTSQUAD_LOOP_ENABLED=1` before launching Claude Code. The recommended alias:

```bash
alias squadmode='AGENTSQUAD_LOOP_ENABLED=1 claude --model claude-opus-4-6 --dangerously-skip-permissions'
```

## Customization

### Custom notification handlers

Override the notification script by replacing `scripts/agentsquad/notify.sh` or setting `AGENTSQUAD_NOTIFY_WEBHOOK` to your webhook URL.

### Custom iteration budgets

Override per-task by passing a second argument to spawn-worker:

```bash
bash scripts/agentsquad/spawn-worker.sh my-task 40
```

### Task-specific environment

Create `.tasks/<task-id>/environment.md` with environment-specific instructions. The worker reads this file and follows the instructions within.

### Interface documents

Place shared documentation in `.tasks/_interfaces/`. All workers read these files for context about system architecture, data models, and API contracts.
