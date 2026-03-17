# claude-improver

A Claude Code plugin that analyzes your past interactions and repository patterns, then proposes actionable self-improvements — new skills, commands, and CLAUDE.md rules — with your confirmation before writing anything.

No MCP server. No build step. No external dependencies. Just a skill.

---

## Installation

```
/plugin marketplace add Joedac/claude-improver
/plugin install claude-improver
```

---

## Usage

```
/improve-yourself             # full analysis + apply
/improve-yourself --dry-run   # analysis only, no writes
```

You can also trigger it naturally:

> "analyze my usage", "suggest improvements", "what patterns do you see in my workflow"

---

## What it does

### 1. Loads memory
Reads `.claude/improve-yourself.json` to skip suggestions you've already applied or rejected. Runs are additive — you never see the same suggestion twice.

### 2. Analyzes in parallel

**Git history** — last 50 commits: hot files (modified 8+ times), recurring commit types (feat/fix/refactor), naming conventions.

**Session history** — last 5 JSONL session files in `~/.claude/projects/`. Extracts:
- Repeated user requests (3+ occurrences → skill candidate)
- Frequently run Bash commands (5+ occurrences → command candidate)
- Frequently edited files via tool calls → checklist skill candidate

All analysis uses Claude's native tools (Glob, Read, Bash) — no external scripts.

### 3. Proposes improvements

| Pattern | Suggestion type |
|---|---|
| File modified 8+ times | Skill |
| Recurring commit type | CLAUDE.md convention rule |
| Repeated Bash command (5+) | Command or skill |
| Repeated user request (3+) | Skill |
| Frequently edited file | Checklist skill |

### 4. Asks for confirmation

```
| # | Name                  | Type     | Reason                        | Impact |
|---|-----------------------|----------|-------------------------------|--------|
| 1 | add-translations      | skill    | i18n.ts modified 28× in git   | high   |
| 2 | git-commit-convention | claude-md| feat/fix used in 80% commits  | medium |

Apply all, select by number, or none?
To reject permanently: prefix with r: (e.g. "1,r:3")
```

Nothing is written until you confirm.

### 5. Writes the files

- **skill** → `.claude/skills/<name>/SKILL.md` with frontmatter + project-specific instructions
- **command** → `.claude/commands/<name>.md`
- **claude-md** → appends rules to `CLAUDE.md` (never overwrites)

### 6. Updates memory

Saves `.claude/improve-yourself.json` with applied/rejected IDs and timestamp. Rejected suggestions are permanently excluded from future runs.

---

## Plugin structure

```
claude-improver/
  .claude/
    commands/improve-yourself.md   ← slash command
  skills/
    improve-yourself/SKILL.md      ← all the logic
  .claude-plugin/
    plugin.json                    ← plugin manifest
    marketplace.json               ← marketplace entry
  install.sh / uninstall.sh
  README.md
  package.json
```

---

## Memory file format

`.claude/improve-yourself.json` (stored in your project):

```json
{
  "applied": ["skill-add-translations", "command-new-feature"],
  "rejected": ["skill-add-route"],
  "lastRun": "2026-03-17T10:00:00.000Z"
}
```

---

## License

MIT — [Joedac](https://github.com/Joedac)
