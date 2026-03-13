---
description: Analyze past interactions and propose actionable improvements (skills, commands, CLAUDE.md). Supports --dry-run and --auto modes.
---

You are running the `/improve-yourself` command from the **claude-improver** plugin.

**IMPORTANT: Always call `improve_yourself_analyze` fresh — never reuse previous results from the conversation context.**

## Step 1 – Analyze

Call `improve_yourself_analyze` with `project_root` set to the current project's absolute path.

## Step 2 – Generate improvements

Based on the patterns returned, generate project-specific improvements. For each relevant pattern:

- **skill** → create `.claude/skills/<name>/SKILL.md` with a SKILL frontmatter and detailed instructions tailored to this project
- **command** → create `.claude/commands/<name>.md` with step-by-step instructions for Claude to follow
- **claude-md** → append rules to `CLAUDE.md` reflecting conventions observed in the patterns
- **prompt** → create `.claude/prompts/<name>.md` for reusable prompt templates

**Generation rules:**
- Be specific to THIS project — use actual file names, frameworks, conventions observed in the patterns
- Do not use generic boilerplate — every line should reflect something real detected in the project
- For `bash-*` patterns: create a command or skill that automates that exact workflow
- For `tool-hot-files` patterns: create a CLAUDE.md checklist of those files
- For `commit-type-*` patterns: create a commit convention rule in CLAUDE.md
- For `workflow-*` patterns: create a command that encodes the full workflow
- For `repeated-prompt` patterns: create a skill that handles that exact request type

## Step 3 – Present to user

Show a table of what you're about to create:

| # | Name | Type | Path | Reason |
|---|------|------|------|--------|

Then ask: *"Apply all, select specific ones (give numbers), or none?"*

## Step 4 – Apply

If `--dry-run` was passed: stop here, do not apply.

Otherwise, once the user confirms:

1. Call `improve_yourself_apply` with:
   - `improvements`: array of `{ id, name, type, outputPath, content }` for approved items
   - `rejected_ids`: pattern IDs the user explicitly rejected
   - `project_root`: absolute path

2. Show the result.

## Rules

- **CRITICAL**: You MUST call `improve_yourself_analyze` first. Do NOT do your own git/file analysis.
- **Never write files yourself** — always delegate to `improve_yourself_apply`.
- **Always confirm** before applying, even in `--auto` mode.
- If the MCP tool call fails, report the error — do not fall back to manual analysis.
- Use the pattern `id` as the base for the improvement `id` (e.g. pattern `bash-npm-test` → improvement id `skill-npm-test`).
