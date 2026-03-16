---
name: improve-yourself
description: >
  Analyze past interactions and repository patterns to propose actionable self-improvements:
  new skills, commands, and CLAUDE.md rules — with user confirmation before writing anything.
trigger: >
  improve yourself, analyze my usage, suggest improvements, create skills from my history,
  what patterns do you see, optimize my Claude setup, /improve-yourself
version: 2.0.0
---

# improve-yourself

Analyze this project's history and generate actionable, project-specific improvements.

## Step 1 — Load memory

Read `.claude/improve-yourself.json` if it exists. It contains:

```json
{
  "applied": ["skill-add-i18n-key", "command-new-feature"],
  "rejected": ["skill-add-route"],
  "lastRun": "2026-03-16T10:00:00.000Z"
}
```

Any ID in `applied` or `rejected` must be excluded from suggestions this run.

## Step 2 — Analyze

Run all of these in parallel:

**Git history:**
```bash
git log --name-only --format='COMMIT: %s' -50 2>/dev/null
```
Extract: files modified most often (hot files), recurring commit message patterns, conventional commit types (feat/fix/refactor...).

**Session history:**
```bash
ENCODED=$(echo "$PWD" | sed 's|/|-|g') && ls ~/.claude/projects/${ENCODED}/*.jsonl 2>/dev/null | sort -t_ -k1 -r | head -5
```
For each file found, extract using this reliable approach:
```bash
python3 -c "
import json, sys
data = []
for line in open('$FILE'):
    try:
        r = json.loads(line)
        msg = r.get('message', {})
        role = msg.get('role', '')
        content = msg.get('content', [])
        if isinstance(content, list):
            for block in content:
                if role == 'user' and block.get('type') == 'text':
                    data.append(('user', block.get('text', '')[:200]))
                elif role == 'assistant' and block.get('type') == 'tool_use':
                    data.append(('tool', block.get('name','') + ': ' + json.dumps(block.get('input',{}))[:100]))
    except: pass
for r,t in data[-50:]: print(r + ' | ' + t[:150])
"
```
Extract: repeated user requests, frequently run Bash commands (normalize: `npm test`, `git commit`, `composer install`...), frequently edited files via Edit/Write tool calls.

## Step 3 — Generate suggestions

For each significant pattern **not already in applied/rejected**, propose ONE improvement. Be specific — use actual file names, commands, and conventions from this project.

| Pattern type | Suggested improvement |
|---|---|
| File modified 8+ times in git | Skill for that task |
| Recurring commit type (feat/fix...) | CLAUDE.md convention rule |
| Repeated Bash command (5+ times) | Command or skill |
| Repeated user request (3+ times) | Skill |
| Frequently edited file via tool calls | Checklist skill |
| Convention observed in code/commits | CLAUDE.md rule |

Generate IDs like `skill-add-i18n-key`, `command-new-feature`, `claude-md-commit-convention`.

## Step 4 — Present

Show a table:

| # | Name | Type | Reason | Impact |
|---|------|------|--------|--------|

Then ask: **"Apply all, select by number, or none? To reject permanently, prefix with `r:` (e.g. `1,r:3` applies #1 and permanently rejects #3)"**

If `--dry-run` was passed: stop here, do not write anything.

## Step 5 — Apply

For each approved improvement, write the file using the Write tool:

- **skill** → `.claude/skills/<name>/SKILL.md` with proper frontmatter (`name`, `description`, `trigger`) and detailed instructions specific to this project
- **command** → `.claude/commands/<name>.md` with step-by-step instructions
- **claude-md** → append new rules to `CLAUDE.md` (never overwrite, append only)

## Step 6 — Update memory

Write `.claude/improve-yourself.json` with updated applied/rejected lists and current timestamp. Preserve existing entries, only add new ones.
