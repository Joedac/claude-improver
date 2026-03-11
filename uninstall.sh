#!/usr/bin/env bash
set -e

claude mcp remove claude-improver 2>/dev/null && echo "  ✓ MCP server removed" || echo "  - MCP server was not registered"
rm -f "$HOME/.claude/commands/improve-yourself.md" && echo "  ✓ Command removed"

echo "claude-improver uninstalled."
