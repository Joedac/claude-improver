#!/usr/bin/env bash
set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_COMMANDS_DIR="$HOME/.claude/commands"

echo "Installing claude-improver from $PLUGIN_DIR..."

mkdir -p "$CLAUDE_COMMANDS_DIR"
ln -sf "$PLUGIN_DIR/.claude/commands/improve-yourself.md" "$CLAUDE_COMMANDS_DIR/improve-yourself.md"
echo "  ✓ /improve-yourself command installed"

echo ""
echo "Done. Run: /improve-yourself --dry-run"
