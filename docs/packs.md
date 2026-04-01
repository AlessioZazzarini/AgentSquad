# Packs

Packs are optional capability modules. Install them with `agentsquad add <pack>`.

## Available Packs

### collab

Cross-model collaboration. Delegate work to a secondary AI model (e.g., Codex) for independent implementation, review, or debugging.

```bash
agentsquad add collab
```

Adds:
- `scripts/agentsquad/bin/collab-bridge.sh` -- bridge script for calling secondary model
- `.claude/commands/collab.md` -- full collaboration command (think/build/debug)
- `.claude/commands/collab-review.md` -- quick review command
- `.collab/specs/` -- directory for build specifications

Configuration:
- `AGENTSQUAD_SECONDARY_MODEL` -- model to use (default: gpt-5.4)
- `AGENTSQUAD_SECONDARY_CLI` -- CLI command (default: codex)

See [collab.md](collab.md) for detailed usage.

### github

GitHub issue orchestration with label-based state management.

```bash
agentsquad add github
```

Adds:
- `scripts/agentsquad/close-task.sh` -- merge PR, archive task, close issue
- `.claude/commands/orchestrate.md` -- multi-issue orchestration with dependency resolution

Labels managed: `squad:ready`, `squad:queued`, `squad:in-progress`, `squad:complete`, `squad:failed`

### vercel

Vercel preview deployment and E2E testing integration.

```bash
agentsquad add vercel
```

Adds (stubs -- implement for your project):
- `scripts/agentsquad/wait-for-vercel.sh` -- poll for successful preview deployment
- `scripts/agentsquad/run-preview-e2e.sh` -- run E2E tests against preview URL

### notifications

Extended notification scripts for Slack and Telegram.

```bash
agentsquad add notifications
```

Adds (stubs -- implement for your project):
- `scripts/agentsquad/notify-slack.sh` -- Slack incoming webhook
- `scripts/agentsquad/notify-telegram.sh` -- Telegram Bot API

### supabase

Supabase branch database management for isolated testing.

```bash
agentsquad add supabase
```

Adds (stubs -- implement for your project):
- `scripts/agentsquad/create-branch-db.sh` -- create branch database for preview deployments

## Creating Custom Packs

A pack is a directory under `packs/` with this structure:

```
packs/my-pack/
  scripts/       # Shell scripts (copied to scripts/agentsquad/)
  bin/           # Executable scripts (copied to scripts/agentsquad/bin/)
  commands/      # Claude commands (copied to .claude/commands/)
  specs/         # Spec templates (copied to .collab/specs/)
```

All directories are optional. Only include what your pack needs.
