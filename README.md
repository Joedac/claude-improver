# claude-improver

A Claude Code plugin that analyzes your past interactions and repository patterns, then proposes actionable self-improvements — new skills, commands, prompt templates, and CLAUDE.md updates — with user confirmation before touching any file.

---

## Installation

### Option A — Via Claude Code plugin marketplace (recommended)

Dans Claude Code :

```
/plugin marketplace add Joedac/claude-improver
/plugin install claude-improver
```

### Option B — Manual install from GitHub

```bash
git clone https://github.com/Joedac/claude-improver \
  ~/.claude/plugins/claude-improver
```

Claude Code will automatically:
- Register the MCP server from `.mcp.json`
- Load the slash command from `commands/`
- Load the skill from `skills/`

> No `npm install` needed — `dist/index.js` is a pre-built standalone bundle.

### Option C — Project-local install

To use the plugin only in a specific project:

```bash
git clone https://github.com/Joedac/claude-improver \
  /path/to/your-project/.claude/plugins/claude-improver
```

---

## Usage

### In Claude Code

```
/improve-yourself
```

```
/improve-yourself --dry-run
```

```
/improve-yourself --auto
```

### Workflow

1. Claude runs `improve_yourself_analyze` on your project
2. Displays a scored improvements table
3. Asks which improvements to apply
4. You reply with IDs, `all`, or `none`
5. Confirms once, then writes only what you approved

### Example output

```
## Analysis Summary

  Conversations analyzed : 227
  Commits analyzed       : 200
  Patterns detected      : 8
  Improvements proposed  : 5

## Suggested Improvements

   Improvement       Type       Reason                          Impact  Score
   ──────────────    ─────────  ──────────────────────────────  ──────  ─────
1. add-types         skill      44 TS errors detected           high    100
2. /generate-tests   command    Workflow repeated 6 times       high    88
3. generate-tests    skill      Prompt repeated 6 times         high    85
4. CLAUDE.md         claude-md  3 rules from detected patterns  high    90
5. generate-tests    prompt     Used 6 times — save template    medium  75
```

---

## Mode reference

| Command | Behavior |
|---------|----------|
| `/improve-yourself` | Analyze + interactive selection |
| `/improve-yourself --dry-run` | Suggest only, no file writes |
| `/improve-yourself --auto` | Analyze + apply all (one confirmation) |

---

## MCP tools (direct access)

The plugin exposes 4 tools usable in any MCP client:

| Tool | Description |
|------|-------------|
| `improve_yourself_analyze` | Scan and return scored suggestions |
| `improve_yourself_preview` | Diff for a specific improvement |
| `improve_yourself_apply` | Write selected improvements to disk |
| `improve_yourself_history` | Show applied improvement log |

---

## What gets generated

| Output | Location |
|--------|----------|
| Skills | `.claude/skills/<name>.md` |
| Commands | `.claude/commands/<name>.md` |
| Prompt templates | `.claude/prompts/<name>.md` |
| CLAUDE.md rules | `CLAUDE.md` (append-only, never overwritten) |

---

## Data sources

- `~/.claude/projects/<project>/` — Claude Code session history (JSONL)
- Git log — last 200 commits, commit messages, frequently modified files
- Source files — TypeScript errors, implicit `any`, missing types
- `.github/` / `docs/` — PR descriptions and templates

---

## Plugin structure

```
claude-improver/
  .mcp.json                        ← MCP server config (auto-loaded by Claude Code)
  .gitignore
  commands/
    improve-yourself.md            ← slash command definition
  skills/
    improve-yourself/
      SKILL.md                     ← skill triggered automatically
  dist/
    index.js                       ← pre-built standalone MCP server (committed)
  src/                             ← TypeScript source
    index.ts
    types/index.ts
    commands/improve-yourself.ts
    analyzers/
      conversation-analyzer.ts
      error-detector.ts
      workflow-analyzer.ts
    generators/
      skill-generator.ts
      command-generator.ts
      prompt-generator.ts
      claude-md-generator.ts
    approval/approval-manager.ts
    storage/improvement-history.ts
    utils/
      file-utils.ts
      pattern-detector.ts
      claude-paths.ts
  package.json
  tsconfig.json
  README.md
```

---

## Development

```bash
npm install
npm run build      # typecheck + bundle → dist/index.js
npm run dev        # run MCP server with tsx (no build needed)
npm run typecheck  # type-check only
```

### Publishing a new version

```bash
npm run build      # rebuilds dist/index.js
git add dist/index.js
git commit -m "chore: rebuild bundle"
git push
```

Users who already installed the plugin can update with:
```bash
claude plugins update claude-improver
# or manually:
cd ~/.claude/plugins/claude-improver && git pull
```

---

## Extending

### Add a new analyzer

Create `src/analyzers/my-analyzer.ts`, implement:
```typescript
async analyze(): Promise<{ patterns: DetectedPattern[]; stats: Record<string, number> }>
```
Then add it to `runImproveYourself()` in `src/commands/improve-yourself.ts`.

### Add new skill templates

Open `src/generators/skill-generator.ts` → `SKILL_TEMPLATES`.

### Add new command templates

Open `src/generators/command-generator.ts` → `COMMAND_TEMPLATES`.

---

## License

MIT
