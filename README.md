# claude-improver

A Claude Code plugin that analyzes your past interactions and repository patterns, then proposes actionable self-improvements — new skills, commands, and CLAUDE.md rules — with user confirmation before writing anything.

No MCP server. No build step. Just a skill.

---

## Installation

```
/plugin marketplace add Joedac/claude-improver
/plugin install claude-improver
```

---

## Usage

```
/improve-yourself
/improve-yourself --dry-run
```

---

## What it does

1. Reads `.claude/improve-yourself.json` to skip already applied/rejected suggestions
2. Analyzes git history (hot files, commit patterns) and session JSONL (repeated requests, tool call patterns)
3. Generates project-specific skills, commands, and CLAUDE.md rules
4. Asks for confirmation before writing anything
5. Updates memory so suggestions don't repeat

---

## Plugin structure

```
claude-improver/
  .claude/commands/improve-yourself.md   ← slash command
  skills/improve-yourself/SKILL.md       ← all the logic
  README.md
  package.json
```

---

## License

MIT
