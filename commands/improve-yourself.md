---
description: Analyze past interactions and repo patterns to suggest improvements (skills, commands, CLAUDE.md). Supports --dry-run.
argument-hint: [--dry-run] [--auto]
allowed-tools: Bash, Read, Glob, Grep, Write
---

You are running `/improve-yourself`. Analyze this project's history and propose actionable Claude Code improvements. Follow these steps precisely.

## Step 1 — Collect data

Run all of the following **in parallel**:

**A. Conversation history**

Find the Claude Code session files for this project:
```bash
PROJECT_ENCODED=$(echo "$PWD" | sed 's|/|-|g')
ls ~/.claude/projects/${PROJECT_ENCODED}/*.jsonl 2>/dev/null | head -20
```

Then extract all user messages (role=user, content is text, skip tool_result blocks):
```bash
PROJECT_ENCODED=$(echo "$PWD" | sed 's|/|-|g')
cat ~/.claude/projects/${PROJECT_ENCODED}/*.jsonl 2>/dev/null \
  | grep '"role":"user"' \
  | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        r = json.loads(line)
        msg = r.get('message', {})
        if msg.get('role') != 'user': continue
        c = msg.get('content', '')
        if isinstance(c, str): print(c[:200])
        elif isinstance(c, list):
            for b in c:
                if b.get('type') == 'text': print(b.get('text','')[:200])
    except: pass
" 2>/dev/null | head -300
```

**B. Git history**
```bash
git log --oneline -100 2>/dev/null
git log --format='%s' -200 2>/dev/null | sort | uniq -c | sort -rn | head -20
```

**C. Frequently modified files**
```bash
git log --name-only --format='' -100 2>/dev/null | grep -v '^$' | sort | uniq -c | sort -rn | head -15
```

**D. TypeScript/code issues**
```bash
# Count any/implicit-any in source files
grep -r --include="*.ts" --include="*.tsx" -l ": any" . 2>/dev/null | head -10
grep -r --include="*.ts" --include="*.tsx" -c ": any" . 2>/dev/null | grep -v ":0$" | sort -t: -k2 -rn | head -10
```

**E. Existing CLAUDE.md**
```bash
cat CLAUDE.md 2>/dev/null || echo "(no CLAUDE.md)"
```

**F. Already applied improvements**
```bash
cat .claude/improvement-history.json 2>/dev/null || echo "(no history)"
```

## Step 2 — Detect patterns

Analyze the collected data and detect:

1. **Repeated prompts** — user messages with similar phrasing repeated 3+ times → candidate for a skill
2. **Repetitive workflows** — sequences of similar tasks repeated 4+ times → candidate for a command
3. **Code quality issues** — many `: any`, missing types, recurring errors → candidate for CLAUDE.md rule
4. **Hot files** — files modified 5+ times → possible automation opportunity
5. **User corrections** — messages containing "non", "pas ce que", "refais", "wrong", "not what I asked", "try again", "actually" → candidate for CLAUDE.md rule

Ignore noise: system messages ("Request interrupted by user"), file paths, code blocks.

## Step 3 — Generate improvements

For each detected pattern, propose one or more improvements from this list:

| Type | When | Output path |
|------|------|-------------|
| `skill` | Repeated prompt 3+ times | `.claude/skills/<name>/SKILL.md` |
| `command` | Repetitive workflow 4+ times | `.claude/commands/<name>.md` |
| `claude-md` | Code errors or corrections | `CLAUDE.md` (append section) |
| `prompt` | Template worth reusing | `.claude/prompts/<name>.md` |

Score each improvement 0–100 based on: frequency × confidence.

## Step 4 — Display the table

Show a clear markdown table:

```
| # | Improvement | Type | Reason | Impact | Score |
|---|-------------|------|--------|--------|-------|
| 1 | generate-tests | skill | repeated 6x | high | 88 |
...
```

Then list the files that would be created:
```
Files to create:
  .claude/skills/generate-tests/SKILL.md
  .claude/commands/generate-tests.md
  CLAUDE.md (update)
```

## Step 5 — Confirm (skip if --dry-run)

If `$ARGUMENTS` does NOT contain `--dry-run`:

Ask: **"Which improvements would you like to apply? Reply with numbers (e.g. `1,3`), `all`, or `none`."**

Wait for the user's reply before proceeding.

If `$ARGUMENTS` contains `--auto`: apply all after a single confirmation ("Apply all X improvements? yes/no").

## Step 6 — Apply approved improvements

For each approved improvement, generate and write the file content.

**Skill template** (`.claude/skills/<name>/SKILL.md`):
```markdown
---
name: <name>
description: <one-line trigger description for Claude>
version: 1.0.0
---

# <name>

## When to use
<Describe the trigger conditions>

## Instructions
<Step-by-step instructions for Claude>

## Examples
<2-3 example user prompts that trigger this skill>
```

**Command template** (`.claude/commands/<name>.md`):
```markdown
---
description: <short description>
allowed-tools: Bash, Read, Write, Glob, Grep
---

<Instructions for Claude to follow when this command is invoked>
```

**CLAUDE.md update** — append a new section at the end of the existing file (never overwrite):
```markdown

## Auto-generated rules (improve-yourself — <date>)

<rules derived from detected patterns>
```

## Step 7 — Save history

After applying, append to `.claude/improvement-history.json`:
```json
[
  { "id": "<improvement-id>", "type": "<type>", "appliedAt": "<ISO date>", "outputPath": "<path>" }
]
```
(Read existing file first and merge, don't overwrite.)

## Step 8 — Summary report

Print a clean summary:
```
Applied X improvement(s):
  ✓ .claude/skills/generate-tests/SKILL.md  (skill, score: 88)
  ✓ CLAUDE.md  (claude-md, score: 72)
```

---

## Rules

- **Never apply without explicit confirmation** (except --auto with one confirmation)
- **--dry-run**: run steps 1–4 only, print table, stop
- If no patterns detected: say so clearly and explain what would generate more data (use Claude Code more on this project)
- Don't generate improvements already in `.claude/improvement-history.json`
