import path from 'path';
import { AnalysisResult, DetectedPattern, Improvement, ImproveYourselfOptions } from '../types/index.js';
import { ConversationAnalyzer } from '../analyzers/conversation-analyzer.js';
import { ErrorDetector } from '../analyzers/error-detector.js';
import { WorkflowAnalyzer } from '../analyzers/workflow-analyzer.js';
import { SkillGenerator } from '../generators/skill-generator.js';
import { CommandGenerator } from '../generators/command-generator.js';
import { PromptGenerator } from '../generators/prompt-generator.js';
import { ClaudeMdGenerator } from '../generators/claude-md-generator.js';
import { ImprovementHistoryStore } from '../storage/improvement-history.js';
import {
  renderImprovementsTable,
  renderDiff,
  renderConfirmationSummary,
  applyImprovements,
  renderSummaryReport,
} from '../approval/approval-manager.js';

export interface RunResult {
  analysis: AnalysisResult;
  improvements: Improvement[];
  table: string;
  confirmationPrompt?: string;
  diffs?: Record<string, string>;
  applied?: ReturnType<typeof renderSummaryReport>;
}

/**
 * Main entry point for the /improve-yourself command.
 *
 * In "analyze" mode (default / dry-run): returns analysis and suggestions.
 * In "apply" mode (selectedIds provided): applies the selected improvements.
 */
export async function runImproveYourself(opts: ImproveYourselfOptions): Promise<RunResult> {
  const projectRoot = opts.projectRoot ?? process.cwd();

  // ── Step 1: Run analyzers ─────────────────────────────────────────────────
  const [convResult, errResult, wfResult] = await Promise.all([
    new ConversationAnalyzer(projectRoot).analyze(),
    new ErrorDetector(projectRoot).analyze(),
    new WorkflowAnalyzer(projectRoot).analyze(),
  ]);

  const allPatterns: DetectedPattern[] = [
    ...convResult.patterns,
    ...errResult.patterns,
    ...wfResult.patterns,
  ];

  const stats: AnalysisResult['stats'] = {
    conversationsAnalyzed: convResult.stats.conversationsAnalyzed,
    commitsAnalyzed: wfResult.stats.commitsAnalyzed,
    patternsDetected: allPatterns.length,
    timestamp: new Date().toISOString(),
  };

  // ── Step 2: Generate improvements ─────────────────────────────────────────
  const skillGen = new SkillGenerator();
  const cmdGen = new CommandGenerator();
  const promptGen = new PromptGenerator();
  const claudeMdGen = new ClaudeMdGenerator(projectRoot);

  const rawImprovements: Array<Improvement | null> = [
    ...allPatterns.flatMap((p) => [
      skillGen.generateFromPattern(p),
      cmdGen.generateFromPattern(p),
      promptGen.generateFromPattern(p),
    ]),
    await claudeMdGen.generateFromPatterns(allPatterns),
  ];

  // Deduplicate by id, sort by score desc
  const seen = new Set<string>();
  const store = new ImprovementHistoryStore(projectRoot);
  const rejectedIds = await store.getRejectedIds();

  const improvements: Improvement[] = rawImprovements
    .filter((i): i is Improvement => i !== null)
    .filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    .filter((i) => !rejectedIds.has(i.id))
    .sort((a, b) => b.score - a.score);

  const analysis: AnalysisResult = { patterns: allPatterns, improvements, stats };

  // ── Step 3: Handle apply mode ─────────────────────────────────────────────
  if (opts.selectedIds && opts.selectedIds.length > 0 && !opts.dryRun) {
    const toApply = improvements.filter((i) => opts.selectedIds!.includes(i.id));
    const result = await applyImprovements(toApply, projectRoot, false);

    // Record history
    if (result.applied.length > 0) {
      const store = new ImprovementHistoryStore(projectRoot);
      await store.record(result.applied);
    }

    return {
      analysis,
      improvements,
      table: renderImprovementsTable(improvements),
      applied: renderSummaryReport(result, false),
    };
  }

  // ── Step 4: Dry-run / analysis mode ───────────────────────────────────────
  const table = renderImprovementsTable(improvements);
  const confirmationPrompt = improvements.length > 0
    ? renderConfirmationSummary(improvements)
    : 'No improvements detected.';

  // Generate diffs for all improvements
  const diffs: Record<string, string> = {};
  for (const imp of improvements) {
    diffs[imp.id] = await renderDiff(imp, projectRoot);
  }

  return { analysis, improvements, table, confirmationPrompt, diffs };
}

/**
 * Format a complete analysis report suitable for display.
 */
export function formatAnalysisReport(result: RunResult): string {
  const { analysis, table, confirmationPrompt } = result;

  const statsBlock = [
    '## Analysis Summary',
    '',
    `  Conversations analyzed : ${analysis.stats.conversationsAnalyzed}`,
    `  Commits analyzed       : ${analysis.stats.commitsAnalyzed}`,
    `  Patterns detected      : ${analysis.stats.patternsDetected}`,
    `  Improvements proposed  : ${analysis.improvements.length}`,
    `  Timestamp              : ${analysis.stats.timestamp}`,
    '',
  ].join('\n');

  const tableBlock = ['## Suggested Improvements', '', table, ''].join('\n');

  const patternsBlock = analysis.patterns.length > 0
    ? [
        '## Detected Patterns',
        '',
        ...analysis.patterns.map(
          (p) =>
            `  [${p.type.padEnd(22)}] freq=${String(p.frequency).padStart(3)}  conf=${Math.round(p.confidence * 100)}%  id=${p.id}`,
        ),
        '',
      ].join('\n')
    : '';

  const confirmBlock = confirmationPrompt
    ? ['## Next Steps', '', confirmationPrompt, ''].join('\n')
    : '';

  return [statsBlock, tableBlock, patternsBlock, confirmBlock].filter(Boolean).join('\n');
}
