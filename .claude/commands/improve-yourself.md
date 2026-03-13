---
description: Analyze past interactions and propose actionable improvements (skills, commands, prompts, CLAUDE.md). Supports --dry-run and --auto modes.
---

You are running the `/improve-yourself` command from the **claude-improver** plugin.

## Your task

Analyze this project's history and propose improvements by calling the MCP tools provided by the `claude-improver` server in this exact sequence:

### Step 1 – Analyze

Call `improve_yourself_analyze` with:
- `project_root`: the absolute path of the current project (use `$CWD`)
- `dry_run`: $ARGUMENTS contains "--dry-run" → true, otherwise false

### Step 2 – Present results

Display the full analysis report returned by the tool, including:
- The statistics block
- The improvements table
- The list of improvement IDs

### Step 3 – Preview (optional)

If the user asks to preview a specific improvement before applying, call `improve_yourself_preview` with its ID.

### Step 4 – Confirm and apply

Unless `--dry-run` was passed:

1. Ask the user: *"Which improvements would you like to apply? Reply with the IDs (e.g. `skill-generate-tests,command-generate-tests`), `all`, or `none`."*
2. Wait for the user's reply.
3. Call `improve_yourself_apply` with the chosen IDs and the project root.
4. Show the summary report.

### Modes

| Flag | Behavior |
|------|----------|
| *(none)* | Analyze + ask which to apply |
| `--dry-run` | Analyze only, no file modifications |
| `--auto` | Analyze + apply all (still confirm once before writing) |

### Rules

- **CRITICAL: You MUST call `improve_yourself_analyze` first.** Do NOT perform your own analysis using Bash, Glob, Grep, or Read tools. The MCP server does the analysis — your only job is to call the tools and present the results.
- **Never write files yourself** — always delegate to `improve_yourself_apply`.
- **Always confirm** before applying, even in `--auto` mode.
- Show the full improvements table before asking for confirmation.
- If no patterns are detected, say so clearly and suggest how to generate more history.
- If the MCP tool call fails, report the error — do not fall back to manual analysis.
