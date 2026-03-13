import { DetectedPattern } from '../types/index.js';
import { ConversationAnalyzer } from '../analyzers/conversation-analyzer.js';
import { ErrorDetector } from '../analyzers/error-detector.js';
import { WorkflowAnalyzer } from '../analyzers/workflow-analyzer.js';
import { ImprovementHistoryStore } from '../storage/improvement-history.js';

export interface AnalyzeResult {
  patterns: DetectedPattern[];
  formattedOutput: string;
  stats: {
    conversationsAnalyzed: number;
    commitsAnalyzed: number;
    patternsDetected: number;
    timestamp: string;
  };
}

/**
 * Run all analyzers and return detected patterns.
 * Generation is delegated to Claude via the command file.
 */
export async function runAnalyze(projectRoot: string): Promise<AnalyzeResult> {
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

  // Filter previously rejected patterns
  const store = new ImprovementHistoryStore(projectRoot);
  const rejectedIds = await store.getRejectedIds();
  const patterns = allPatterns.filter((p) => !rejectedIds.has(p.id));

  const stats = {
    conversationsAnalyzed: convResult.stats.conversationsAnalyzed,
    commitsAnalyzed: wfResult.stats.commitsAnalyzed,
    patternsDetected: patterns.length,
    timestamp: new Date().toISOString(),
  };

  const formattedOutput = formatPatternsForClaude(patterns, stats);

  return { patterns, formattedOutput, stats };
}

function formatPatternsForClaude(
  patterns: DetectedPattern[],
  stats: AnalyzeResult['stats'],
): string {
  const lines: string[] = [
    '## Analysis Summary',
    '',
    `  Conversations analyzed : ${stats.conversationsAnalyzed}`,
    `  Commits analyzed       : ${stats.commitsAnalyzed}`,
    `  Patterns detected      : ${stats.patternsDetected}`,
    `  Timestamp              : ${stats.timestamp}`,
    '',
  ];

  if (patterns.length === 0) {
    lines.push('No patterns detected. Use Claude more on this project to generate history.');
    return lines.join('\n');
  }

  lines.push('## Detected Patterns');
  lines.push('');
  lines.push('> Use these patterns to generate project-specific skills, commands, and CLAUDE.md rules.');
  lines.push('> Then call `improve_yourself_apply` with your generated improvements.');
  lines.push('');

  for (const p of patterns) {
    lines.push(`---`);
    lines.push(`**${p.id}** (${p.type})`);
    lines.push(`- Frequency  : ${p.frequency} occurrences`);
    lines.push(`- Confidence : ${Math.round(p.confidence * 100)}%`);
    if (p.examples.length > 0) {
      lines.push(`- Examples   :`);
      for (const ex of p.examples.slice(0, 3)) {
        lines.push(`    - ${ex}`);
      }
    }
    if (p.metadata && Object.keys(p.metadata).length > 0) {
      const meta = JSON.stringify(p.metadata, null, 0).slice(0, 200);
      lines.push(`- Metadata   : ${meta}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Output paths');
  lines.push('');
  lines.push('- skill     → `.claude/skills/<name>/SKILL.md`');
  lines.push('- command   → `.claude/commands/<name>.md`');
  lines.push('- claude-md → `CLAUDE.md` (append)');
  lines.push('- prompt    → `.claude/prompts/<name>.md`');

  return lines.join('\n');
}
