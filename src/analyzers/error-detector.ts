import path from 'path';
import { ErrorAnalysis, DetectedPattern } from '../types/index.js';
import { findFiles, readTextFile, directoryExists } from '../utils/file-utils.js';
import { getClaudeDataDir } from '../utils/claude-paths.js';

const TS_ERROR_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /Type '(.+?)' is not assignable to type '(.+?)'/g, label: 'type-mismatch' },
  { pattern: /Cannot find module '(.+?)'/g, label: 'missing-module' },
  { pattern: /Property '(.+?)' does not exist on type/g, label: 'missing-property' },
  { pattern: /Object is possibly '(null|undefined)'/g, label: 'null-check' },
  { pattern: /Argument of type '(.+?)' is not assignable/g, label: 'wrong-arg-type' },
  { pattern: /Parameter '(.+?)' implicitly has an 'any' type/g, label: 'implicit-any' },
];

const MISSING_IMPORT_PATTERNS = [
  /import\s+.*?\s+from\s+'([^']+)'/g,
  /require\('([^']+)'\)/g,
];

export class ErrorDetector {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async analyze(): Promise<{ patterns: DetectedPattern[]; stats: { filesScanned: number } }> {
    const errorAnalysis = await this.scanForErrors();
    const patterns = this.buildPatterns(errorAnalysis);

    return {
      patterns,
      stats: { filesScanned: errorAnalysis.filesScanned },
    };
  }

  private async scanForErrors(): Promise<ErrorAnalysis & { filesScanned: number }> {
    const typeErrors: ErrorAnalysis['typeErrors'] = [];
    const missingImports: ErrorAnalysis['missingImports'] = [];
    const testFailures: ErrorAnalysis['testFailures'] = [];

    let filesScanned = 0;

    // Scan log files for TypeScript errors
    const logDirs = [
      path.join(this.projectRoot, '.claude'),
      path.join(this.projectRoot, 'logs'),
      path.join(getClaudeDataDir(), 'logs'),
    ];

    const logErrorCounts = new Map<string, number>();
    const importCounts = new Map<string, number>();

    for (const logDir of logDirs) {
      if (!(await directoryExists(logDir))) continue;

      const files = await findFiles('**/*.{log,txt,json}', logDir);
      for (const file of files.slice(0, 30)) {
        const content = await readTextFile(file);
        if (!content) continue;
        filesScanned++;

        // Scan for TypeScript errors in logs
        for (const { pattern, label } of TS_ERROR_PATTERNS) {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            const key = `${label}: ${match[0].slice(0, 60)}`;
            logErrorCounts.set(key, (logErrorCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }

    // Scan source files for potential issues
    const sourceFiles = await findFiles('**/*.{ts,tsx,js,jsx}', this.projectRoot);
    for (const file of sourceFiles.slice(0, 100)) {
      const content = await readTextFile(file);
      if (!content) continue;
      filesScanned++;

      // Check for common code quality issues
      this.detectCodeIssues(content, file, typeErrors, importCounts);
    }

    // Scan test output files
    const testFiles = await findFiles(
      '**/{test-results,coverage,junit}*.{xml,json,txt}',
      this.projectRoot,
    );

    for (const file of testFiles.slice(0, 20)) {
      const content = await readTextFile(file);
      if (!content) continue;
      this.detectTestFailures(content, testFailures);
    }

    // Convert error counts to structured form
    for (const [snippet, frequency] of logErrorCounts) {
      if (frequency >= 2) {
        typeErrors.push({ snippet, frequency });
      }
    }

    // Convert import counts
    for (const [module, frequency] of importCounts) {
      if (frequency >= 3) {
        missingImports.push({ module, frequency });
      }
    }

    return { typeErrors, missingImports, testFailures, filesScanned };
  }

  private detectCodeIssues(
    content: string,
    _filePath: string,
    typeErrors: ErrorAnalysis['typeErrors'],
    importCounts: Map<string, number>,
  ): void {
    // Detect implicit any (common TypeScript issue)
    const implicitAny = content.match(/:\s*any\b/g);
    if (implicitAny && implicitAny.length > 3) {
      typeErrors.push({
        snippet: `excessive 'any' types (${implicitAny.length} occurrences)`,
        frequency: implicitAny.length,
      });
    }

    // Detect missing return types on functions
    const arrowsWithoutTypes = content.match(/\)\s*=>/g);
    const arrowsWithTypes = content.match(/\)\s*:\s*\w+.*?=>/g);
    if (
      arrowsWithoutTypes &&
      arrowsWithTypes &&
      arrowsWithoutTypes.length > arrowsWithTypes.length * 2
    ) {
      typeErrors.push({
        snippet: 'many arrow functions missing return types',
        frequency: arrowsWithoutTypes.length - (arrowsWithTypes?.length ?? 0),
      });
    }

    // Track imports to find commonly used modules
    for (const pattern of MISSING_IMPORT_PATTERNS) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const mod = match[1];
        if (mod && !mod.startsWith('.')) {
          importCounts.set(mod, (importCounts.get(mod) ?? 0) + 1);
        }
      }
    }
  }

  private detectTestFailures(content: string, failures: ErrorAnalysis['testFailures']): void {
    const failPatterns = [
      /FAIL\s+(.+?)[\n\r]/g,
      /✗\s+(.+?)[\n\r]/g,
      /× (.+?)[\n\r]/g,
      /AssertionError:\s*(.+?)[\n\r]/g,
    ];

    const failCounts = new Map<string, number>();
    for (const pattern of failPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const key = match[1]?.slice(0, 80) ?? 'unknown';
        failCounts.set(key, (failCounts.get(key) ?? 0) + 1);
      }
    }

    for (const [pattern, frequency] of failCounts) {
      failures.push({ pattern, frequency });
    }
  }

  private buildPatterns(
    analysis: ErrorAnalysis & { filesScanned: number },
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // TypeScript error patterns
    const topErrors = analysis.typeErrors
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    if (topErrors.length > 0) {
      patterns.push({
        id: 'typescript-errors',
        type: 'code-error',
        frequency: topErrors.reduce((sum, e) => sum + e.frequency, 0),
        examples: topErrors.map((e) => e.snippet),
        confidence: Math.min(topErrors[0].frequency / 5, 1),
        metadata: { errors: topErrors },
      });
    }

    // Frequent missing/external imports → might need docs
    const topImports = [...analysis.missingImports]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    if (topImports.length > 0) {
      patterns.push({
        id: 'frequent-imports',
        type: 'missing-rule',
        frequency: topImports.reduce((sum, i) => sum + i.frequency, 0),
        examples: topImports.map((i) => i.module),
        confidence: 0.6,
        metadata: { modules: topImports },
      });
    }

    // Test failure patterns
    if (analysis.testFailures.length > 0) {
      patterns.push({
        id: 'test-failures',
        type: 'code-error',
        frequency: analysis.testFailures.length,
        examples: analysis.testFailures.slice(0, 3).map((f) => f.pattern),
        confidence: Math.min(analysis.testFailures.length / 5, 1),
        metadata: { failures: analysis.testFailures.slice(0, 10) },
      });
    }

    return patterns;
  }
}
