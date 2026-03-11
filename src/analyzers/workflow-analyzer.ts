import path from 'path';
import { simpleGit, SimpleGit, LogResult } from 'simple-git';
import { GitAnalysis, DetectedPattern } from '../types/index.js';
import { directoryExists, findFiles, readTextFile } from '../utils/file-utils.js';
import { extractRepeatedPhrases } from '../utils/pattern-detector.js';

const WORKFLOW_KEYWORDS = [
  { pattern: /generate.*test/i, label: 'generate-tests', skill: 'generate-tests' },
  { pattern: /write.*test/i, label: 'write-tests', skill: 'generate-tests' },
  { pattern: /add.*test/i, label: 'add-tests', skill: 'generate-tests' },
  { pattern: /write.*doc/i, label: 'write-docs', skill: 'generate-docs' },
  { pattern: /generate.*doc/i, label: 'generate-docs', skill: 'generate-docs' },
  { pattern: /api.*doc/i, label: 'api-docs', skill: 'generate-api-docs' },
  { pattern: /refactor/i, label: 'refactor', skill: 'refactor-code' },
  { pattern: /fix.*lint/i, label: 'fix-lint', skill: 'fix-lint' },
  { pattern: /add.*type/i, label: 'add-types', skill: 'add-types' },
  { pattern: /code.*review/i, label: 'code-review', skill: 'code-review' },
  { pattern: /create.*pr/i, label: 'create-pr', skill: 'create-pr' },
  { pattern: /deploy/i, label: 'deploy', skill: 'deploy' },
  { pattern: /migration/i, label: 'migration', skill: 'create-migration' },
  { pattern: /debug/i, label: 'debug', skill: 'debug-issue' },
];

export class WorkflowAnalyzer {
  private projectRoot: string;
  private git: SimpleGit;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.git = simpleGit(projectRoot);
  }

  async analyze(): Promise<{ patterns: DetectedPattern[]; stats: { commitsAnalyzed: number } }> {
    const [gitAnalysis, prAnalysis] = await Promise.all([
      this.analyzeGitHistory(),
      this.analyzePRs(),
    ]);

    const patterns = this.buildPatterns(gitAnalysis, prAnalysis);
    return {
      patterns,
      stats: { commitsAnalyzed: gitAnalysis.commitsAnalyzed },
    };
  }

  private async analyzeGitHistory(): Promise<GitAnalysis & { commitsAnalyzed: number }> {
    const frequentPaths: GitAnalysis['frequentPaths'] = [];
    const commonMessages: GitAnalysis['commonMessages'] = [];
    const recentActivity: string[] = [];
    let commitsAnalyzed = 0;

    const isGit = await directoryExists(path.join(this.projectRoot, '.git'));
    if (!isGit) {
      return { frequentPaths, commonMessages, recentActivity, commitsAnalyzed };
    }

    try {
      const log: LogResult = await this.git.log({ maxCount: 200 });
      commitsAnalyzed = log.all.length;

      const messages = log.all.map((c) => c.message);
      recentActivity.push(...messages.slice(0, 10));

      // Find repeated commit message patterns
      const phrases = extractRepeatedPhrases(messages, 2, 3);
      for (const phrase of phrases.slice(0, 10)) {
        commonMessages.push({ pattern: phrase.phrase, count: phrase.count });
      }

      // Find frequently modified files
      const fileCounts = new Map<string, number>();
      for (const commit of log.all.slice(0, 50)) {
        try {
          const diff = await this.git.show(['--name-only', '--format=', commit.hash]);
          const files = diff.split('\n').filter((f) => f.trim() && !f.startsWith('diff'));
          for (const file of files) {
            fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
          }
        } catch {
          // skip problematic commits
        }
      }

      const sorted = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [filePath, changeCount] of sorted.slice(0, 10)) {
        frequentPaths.push({ path: filePath, changeCount });
      }
    } catch {
      // git not available or not a repo
    }

    return { frequentPaths, commonMessages, recentActivity, commitsAnalyzed };
  }

  private async analyzePRs(): Promise<{ patterns: string[]; count: number }> {
    const patterns: string[] = [];

    // Check for GitHub PR templates / recent PR descriptions in common locations
    const prDirs = [
      path.join(this.projectRoot, '.github'),
      path.join(this.projectRoot, 'docs'),
    ];

    for (const dir of prDirs) {
      if (!(await directoryExists(dir))) continue;
      const files = await findFiles('**/*.{md,txt}', dir);
      for (const file of files.slice(0, 20)) {
        const content = await readTextFile(file);
        if (!content) continue;

        for (const { pattern, label } of WORKFLOW_KEYWORDS) {
          if (pattern.test(content)) {
            patterns.push(label);
          }
        }
      }
    }

    return { patterns, count: patterns.length };
  }

  private buildPatterns(
    gitAnalysis: GitAnalysis & { commitsAnalyzed: number },
    prAnalysis: { patterns: string[]; count: number },
  ): DetectedPattern[] {
    const detectedPatterns: DetectedPattern[] = [];

    // Detect workflow patterns from commit messages
    const workflowCounts = new Map<string, { count: number; examples: string[] }>();

    for (const { pattern, label } of WORKFLOW_KEYWORDS) {
      const matches = gitAnalysis.recentActivity.filter((m) => pattern.test(m));
      if (matches.length >= 2) {
        const existing = workflowCounts.get(label);
        if (existing) {
          existing.count += matches.length;
          existing.examples.push(...matches.slice(0, 2));
        } else {
          workflowCounts.set(label, { count: matches.length, examples: matches.slice(0, 3) });
        }
      }
    }

    // From PR analysis
    for (const patternLabel of prAnalysis.patterns) {
      const existing = workflowCounts.get(patternLabel);
      if (existing) {
        existing.count++;
      } else {
        workflowCounts.set(patternLabel, { count: 1, examples: [`Found in PR/docs: ${patternLabel}`] });
      }
    }

    for (const [label, data] of workflowCounts) {
      if (data.count < 2) continue;
      detectedPatterns.push({
        id: `workflow-${label}`,
        type: 'repetitive-workflow',
        frequency: data.count,
        examples: data.examples.slice(0, 3),
        confidence: Math.min(data.count / 6, 1),
        metadata: { label, workflowType: label },
      });
    }

    // Frequently modified files indicate missing automation
    if (gitAnalysis.frequentPaths.length > 0) {
      const hotFiles = gitAnalysis.frequentPaths.filter((f) => f.changeCount >= 5);
      if (hotFiles.length > 0) {
        detectedPatterns.push({
          id: 'hot-files',
          type: 'repetitive-workflow',
          frequency: hotFiles.reduce((s, f) => s + f.changeCount, 0),
          examples: hotFiles.slice(0, 3).map((f) => `${f.path} (${f.changeCount}x)`),
          confidence: 0.5,
          metadata: { hotFiles: hotFiles.slice(0, 5) },
        });
      }
    }

    return detectedPatterns;
  }
}
