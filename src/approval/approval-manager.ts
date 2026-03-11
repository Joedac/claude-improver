import path from 'path';
import { Improvement } from '../types/index.js';
import { fileExists, readTextFile, writeTextFile, diffStrings } from '../utils/file-utils.js';

export interface ApprovalRequest {
  improvements: Improvement[];
  dryRun: boolean;
}

export interface ApprovalResult {
  approved: Improvement[];
  skipped: Improvement[];
  applied: Improvement[];
  errors: Array<{ improvement: Improvement; error: string }>;
}

/**
 * Renders a plain-text improvements table for MCP / terminal output.
 */
export function renderImprovementsTable(improvements: Improvement[]): string {
  if (improvements.length === 0) return 'No improvements to show.';

  const cols = {
    name: Math.max(20, ...improvements.map((i) => i.name.length)),
    type: 12,
    reason: Math.max(30, ...improvements.map((i) => i.reason.length)),
    impact: 8,
    score: 7,
  };

  const sep = `  ${'─'.repeat(cols.name)}  ${'─'.repeat(cols.type)}  ${'─'.repeat(Math.min(cols.reason, 50))}  ${'─'.repeat(cols.impact)}  ${'─'.repeat(cols.score)}`;

  const header = [
    `  ${'Improvement'.padEnd(cols.name)}  ${'Type'.padEnd(cols.type)}  ${'Reason'.padEnd(Math.min(cols.reason, 50))}  ${'Impact'.padEnd(cols.impact)}  ${'Score'.padEnd(cols.score)}`,
    sep,
  ];

  const rows = improvements.map((imp, idx) => {
    const reason = imp.reason.length > 50 ? imp.reason.slice(0, 47) + '...' : imp.reason;
    return `${String(idx + 1).padStart(2)}. ${imp.name.padEnd(cols.name - 2)}  ${imp.type.padEnd(cols.type)}  ${reason.padEnd(Math.min(cols.reason, 50))}  ${imp.impact.padEnd(cols.impact)}  ${String(imp.score).padEnd(cols.score)}`;
  });

  return [...header, ...rows].join('\n');
}

/**
 * Renders a preview diff for a single improvement.
 */
export async function renderDiff(improvement: Improvement, projectRoot: string): Promise<string> {
  const fullPath = path.join(projectRoot, improvement.outputPath);
  const existing = (await fileExists(fullPath)) ? (await readTextFile(fullPath)) ?? '' : '';
  const diff = diffStrings(existing, improvement.generatedContent);

  return [
    `--- ${improvement.outputPath} (current)`,
    `+++ ${improvement.outputPath} (proposed)`,
    '',
    diff,
  ].join('\n');
}

/**
 * Renders a confirmation summary before applying improvements.
 */
export function renderConfirmationSummary(improvements: Improvement[]): string {
  const lines = [
    'You are about to create/update:',
    '',
    ...improvements.map((i) => `  ${i.outputPath}  (${i.type})`),
    '',
    'Proceed? Reply with the IDs to apply (e.g. "1,3") or "all" or "none".',
  ];
  return lines.join('\n');
}

/**
 * Apply a list of approved improvements to disk.
 * Returns a result describing what was applied and any errors.
 */
export async function applyImprovements(
  improvements: Improvement[],
  projectRoot: string,
  dryRun: boolean,
): Promise<ApprovalResult> {
  const result: ApprovalResult = {
    approved: improvements,
    skipped: [],
    applied: [],
    errors: [],
  };

  if (dryRun) {
    result.skipped = improvements;
    return result;
  }

  for (const imp of improvements) {
    try {
      const fullPath = path.join(projectRoot, imp.outputPath);
      await writeTextFile(fullPath, imp.generatedContent);
      result.applied.push(imp);
    } catch (err) {
      result.errors.push({
        improvement: imp,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Render the final summary report after applying improvements.
 */
export function renderSummaryReport(result: ApprovalResult, dryRun: boolean): string {
  const lines: string[] = [];

  if (dryRun) {
    lines.push('DRY-RUN: No files were modified.');
    lines.push('');
    lines.push(`Suggested improvements (${result.approved.length}):`);
    for (const imp of result.approved) {
      lines.push(`  [${imp.type.padEnd(10)}] ${imp.outputPath}`);
    }
    return lines.join('\n');
  }

  lines.push(`Applied ${result.applied.length} improvement(s):`);
  for (const imp of result.applied) {
    lines.push(`  ✓ ${imp.outputPath}  (${imp.type}, score: ${imp.score})`);
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push(`Errors (${result.errors.length}):`);
    for (const e of result.errors) {
      lines.push(`  ✗ ${e.improvement.outputPath}: ${e.error}`);
    }
  }

  if (result.skipped.length > 0) {
    lines.push('');
    lines.push(`Skipped (${result.skipped.length}):`);
    for (const imp of result.skipped) {
      lines.push(`  - ${imp.name}`);
    }
  }

  return lines.join('\n');
}
