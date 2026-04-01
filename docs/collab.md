# Cross-Model Collaboration

The collab pack enables Claude Code to delegate work to a secondary AI model for independent implementation, fresh perspectives, and competing hypotheses.

## Install

```bash
agentsquad add collab
```

## Modes

### Think (synchronous)

Read-only. The secondary model reads files but cannot modify anything. Used for debate, review, architecture decisions, and debugging hypotheses.

```bash
scripts/agentsquad/bin/collab-bridge.sh think "Your prompt here"
```

Takes 15-30 seconds. Response streams directly into Claude's context.

### Build (asynchronous)

Write mode. The secondary model can create and modify files. Used for delegated implementation.

```bash
scripts/agentsquad/bin/collab-bridge.sh build "Your prompt here"
scripts/agentsquad/bin/collab-bridge.sh build "Implement this spec" .collab/specs/task.md
```

Runs in the background so you can keep working.

## Workflows

### Debate (Think mode)

1. Claude forms a position on a design question
2. Challenges the secondary model via Think mode
3. Synthesizes areas of agreement and disagreement
4. Runs a second round if needed (max 2 rounds)
5. Presents final recommendation to user

### Delegation (Build mode)

1. Claude writes a spec to `.collab/specs/<name>.md`
2. Launches secondary model in background
3. Reviews output when complete (git diff + run tests)
4. Fixes issues or delegates a follow-up
5. Reports results to user

### Debugging (Think mode)

1. Claude forms Hypothesis A about a bug
2. Gets independent Hypothesis B from secondary model
3. If hypotheses converge: high confidence, fix it
4. If they diverge: design a discriminating test
5. Evidence decides the winner

## Critical Rules

1. **Never overlap files** -- if both models need the same file, work sequentially
2. **Always run tests** after the secondary model builds -- never trust self-reports
3. **Synthesize, don't relay** -- read the output, reason about it, present your synthesis
4. **Unset API keys** -- the bridge script handles this automatically
5. **Keep prompts concise** -- 500 words max for Think, use spec files for Build
6. **Break up large builds** -- 2-3 small focused calls, max 3 files each
7. **Commit before delegating** -- stash or commit your changes first

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENTSQUAD_SECONDARY_MODEL` | gpt-5.4 | Model to use |
| `AGENTSQUAD_SECONDARY_CLI` | codex | CLI command to invoke |

The bridge script automatically unsets `OPENAI_API_KEY` and sets `OTEL_SDK_DISABLED=true`.
