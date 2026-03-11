#!/usr/bin/env bash
set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_COMMANDS_DIR="$HOME/.claude/commands"

echo "Installing claude-improver from $PLUGIN_DIR..."

# 1. Register MCP server
claude mcp add claude-improver node "$PLUGIN_DIR/dist/index.js"
echo "  ✓ MCP server registered"

# 2. Install the slash command
mkdir -p "$CLAUDE_COMMANDS_DIR"
ln -sf "$PLUGIN_DIR/commands/improve-yourself.md" "$CLAUDE_COMMANDS_DIR/improve-yourself.md"
echo "  ✓ /improve-yourself command installed"

echo ""
echo "Done. Restart Claude Code then run: /improve-yourself --dry-run"
