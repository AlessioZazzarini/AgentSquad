# Agents

Agents are domain-specific specialists that handle tasks within their expertise. Define them in `.claude/agents/` with paired skills in `.claude/skills/`.

## Defining an Agent

Create a file like `.claude/agents/frontend.md`:

```markdown
# Frontend Agent

You are a frontend specialist. You handle UI components, forms, accessibility, and styling.

## Domain
- `src/components/**`
- `src/app/**`
- `**/*.css`

## Conventions
- Use the project's component library
- Follow existing patterns for state management
- Ensure accessibility (ARIA labels, keyboard navigation)
- Write unit tests for all new components

## Tools
- Read and Edit for code changes
- Bash for running tests and builds
```

## Defining a Skill

Skills provide deep domain knowledge. Create `.claude/skills/frontend-patterns.md`:

```markdown
# Frontend Patterns

## Component Structure
[Document your project's component conventions here]

## State Management
[Document how state is managed]

## Testing Patterns
[Document how components are tested]
```

## Routing Table

Map file patterns to agents:

```
| Files touched          | Agent              |
|------------------------|--------------------|
| src/components/**      | @frontend          |
| src/lib/api/**         | @backend           |
| src/lib/ai/**          | @ai-specialist     |
| **/*.test.*            | @qa                |
| infrastructure/**      | @devops            |
```

## Rules

1. **Single domain** -- spawn the matching agent directly
2. **Multiple domains** -- create an Agent Team with a lead agent plus QA
3. **Always run QA** after implementing -- never skip testing
4. **Agent boundaries** -- agents should not modify files outside their domain without explicit coordination

## Example: Agent Team

For a task touching both frontend and backend:

1. Spawn `@frontend` for UI changes
2. Spawn `@backend` for API changes
3. Spawn `@qa` to verify everything works together
4. Lead agent (whichever domain is primary) coordinates the team
