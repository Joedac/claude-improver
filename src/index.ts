#!/usr/bin/env node
/**
 * claude-improver MCP server
 *
 * Exposes three tools:
 *   1. improve_yourself_analyze  – run analysis and return suggestions
 *   2. improve_yourself_preview  – return a diff for a specific suggestion
 *   3. improve_yourself_apply    – apply selected improvements to disk
 *   4. improve_yourself_history  – show previously applied improvements
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { runImproveYourself, formatAnalysisReport } from './commands/improve-yourself.js';
import { ImprovementHistoryStore } from './storage/improvement-history.js';
import {
  applyImprovements,
  renderDiff,
  renderSummaryReport,
} from './approval/approval-manager.js';

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'improve_yourself_analyze',
    description:
      'Analyze the project and conversation history to detect patterns and suggest improvements (skills, commands, prompts, CLAUDE.md updates). Use --dry-run to preview without applying.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: {
          type: 'string',
          description: 'Absolute path to the project root. Defaults to cwd.',
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, only suggest improvements without applying them.',
          default: true,
        },
      },
    },
  },
  {
    name: 'improve_yourself_preview',
    description:
      'Preview the diff/content for a specific improvement before applying it.',
    inputSchema: {
      type: 'object',
      required: ['improvement_id'],
      properties: {
        improvement_id: {
          type: 'string',
          description: 'The ID of the improvement to preview (from analyze output).',
        },
        project_root: {
          type: 'string',
          description: 'Absolute path to the project root.',
        },
      },
    },
  },
  {
    name: 'improve_yourself_apply',
    description:
      'Apply selected improvements to disk after user confirmation. Pass improvement IDs from the analyze step.',
    inputSchema: {
      type: 'object',
      required: ['improvement_ids'],
      properties: {
        improvement_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of improvement IDs to apply. Use ["all"] to apply everything.',
        },
        project_root: {
          type: 'string',
          description: 'Absolute path to the project root.',
        },
      },
    },
  },
  {
    name: 'improve_yourself_history',
    description: 'Show the history of improvements that have been applied to this project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: {
          type: 'string',
          description: 'Absolute path to the project root.',
        },
      },
    },
  },
];

// ── Zod schemas ───────────────────────────────────────────────────────────────

const AnalyzeSchema = z.object({
  project_root: z.string().optional(),
  dry_run: z.boolean().default(true),
});

const PreviewSchema = z.object({
  improvement_id: z.string(),
  project_root: z.string().optional(),
});

const ApplySchema = z.object({
  improvement_ids: z.array(z.string()).min(1),
  project_root: z.string().optional(),
});

const HistorySchema = z.object({
  project_root: z.string().optional(),
});

// ── In-memory cache so preview/apply can reference last analysis ──────────────

interface CacheEntry {
  projectRoot: string;
  improvements: Awaited<ReturnType<typeof runImproveYourself>>['improvements'];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(projectRoot: string): CacheEntry | null {
  const entry = cache.get(projectRoot);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(projectRoot);
    return null;
  }
  return entry;
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'claude-improver', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'improve_yourself_analyze': {
        const { project_root, dry_run } = AnalyzeSchema.parse(args ?? {});
        const projectRoot = project_root ?? process.cwd();

        const result = await runImproveYourself({
          projectRoot,
          dryRun: dry_run,
          auto: false,
        });

        // Cache for follow-up calls
        cache.set(projectRoot, {
          projectRoot,
          improvements: result.improvements,
          timestamp: Date.now(),
        });

        const report = formatAnalysisReport(result);
        const ids = result.improvements.map((i, idx) => `  ${idx + 1}. ${i.id}`).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: [
                report,
                ids
                  ? `\nAvailable improvement IDs:\n${ids}\n\nCall \`improve_yourself_apply\` with the IDs you want to apply.`
                  : '',
              ].join('\n'),
            },
          ],
        };
      }

      case 'improve_yourself_preview': {
        const { improvement_id, project_root } = PreviewSchema.parse(args ?? {});
        const projectRoot = project_root ?? process.cwd();

        const cached = getCached(projectRoot);
        if (!cached) {
          return {
            content: [{ type: 'text', text: 'No analysis in cache. Run improve_yourself_analyze first.' }],
          };
        }

        const imp = cached.improvements.find((i) => i.id === improvement_id);
        if (!imp) {
          return {
            content: [{ type: 'text', text: `Improvement "${improvement_id}" not found in last analysis.` }],
          };
        }

        const diff = await renderDiff(imp, projectRoot);
        return {
          content: [
            {
              type: 'text',
              text: [
                `## Preview: ${imp.name} (${imp.type})`,
                '',
                `Reason  : ${imp.reason}`,
                `Impact  : ${imp.impact}  |  Score: ${imp.score}`,
                `Output  : ${imp.outputPath}`,
                '',
                '### Diff',
                '```diff',
                diff,
                '```',
              ].join('\n'),
            },
          ],
        };
      }

      case 'improve_yourself_apply': {
        const { improvement_ids, project_root } = ApplySchema.parse(args ?? {});
        const projectRoot = project_root ?? process.cwd();

        const cached = getCached(projectRoot);
        if (!cached) {
          return {
            content: [{ type: 'text', text: 'No analysis in cache. Run improve_yourself_analyze first.' }],
          };
        }

        const toApply =
          improvement_ids[0] === 'all'
            ? cached.improvements
            : cached.improvements.filter((i) => improvement_ids.includes(i.id));

        if (toApply.length === 0) {
          return {
            content: [{ type: 'text', text: 'None of the specified IDs matched. Check the IDs and try again.' }],
          };
        }

        const result = await applyImprovements(toApply, projectRoot, false);
        const summary = renderSummaryReport(result, false);

        // Persist history
        if (result.applied.length > 0) {
          const store = new ImprovementHistoryStore(projectRoot);
          await store.record(result.applied);
        }

        return { content: [{ type: 'text', text: summary }] };
      }

      case 'improve_yourself_history': {
        const { project_root } = HistorySchema.parse(args ?? {});
        const projectRoot = project_root ?? process.cwd();
        const store = new ImprovementHistoryStore(projectRoot);
        const history = await store.renderHistory();
        return { content: [{ type: 'text', text: history }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr so it doesn't interfere with MCP stdio protocol
  process.stderr.write('claude-improver MCP server started\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
