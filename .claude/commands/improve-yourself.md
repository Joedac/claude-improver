---
description: Analyze past interactions and propose actionable improvements (skills, commands, CLAUDE.md).
---

**Your first and only action before doing anything else: call `improve_yourself_analyze` with `project_root` set to the current working directory.**

Do not use Bash, Glob, Grep, Read, or any other tool before calling `improve_yourself_analyze`. The MCP server handles all data collection.

---

Once you have the patterns from the tool:

1. Generate project-specific improvements for each pattern (skills, commands, CLAUDE.md rules). Be specific — use actual file names and conventions from the patterns.

2. Show a table of what you'll create, then ask: *"Apply all, select by number, or none?"*

3. If `--dry-run` was passed: stop here.

4. Otherwise call `improve_yourself_apply` with:
   - `improvements`: array of `{ id, name, type, outputPath, content }` for approved items
   - `rejected_ids`: pattern IDs the user rejected
   - `project_root`: current working directory

**Never write files yourself — only through `improve_yourself_apply`.**
