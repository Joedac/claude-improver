export type ImprovementType = 'skill' | 'command' | 'prompt' | 'claude-md';

export type ImpactLevel = 'low' | 'medium' | 'high';

export interface DetectedPattern {
  id: string;
  type: 'repeated-prompt' | 'user-correction' | 'code-error' | 'repetitive-workflow' | 'missing-rule';
  frequency: number;
  examples: string[];
  confidence: number; // 0-1
  metadata?: Record<string, unknown>;
}

export interface Improvement {
  id: string;
  type: ImprovementType;
  name: string;
  reason: string;
  impact: ImpactLevel;
  score: number; // 0-100
  pattern: DetectedPattern;
  outputPath: string;
  generatedContent: string;
}

export interface AnalysisResult {
  patterns: DetectedPattern[];
  improvements: Improvement[];
  stats: {
    conversationsAnalyzed: number;
    commitsAnalyzed: number;
    patternsDetected: number;
    timestamp: string;
  };
}

export interface AppliedImprovement {
  id: string;
  name: string;
  type: ImprovementType;
  appliedAt: string;
  outputPath: string;
}

export interface ImprovementHistory {
  version: string;
  improvements: AppliedImprovement[];
}

export interface ImproveYourselfOptions {
  dryRun: boolean;
  auto: boolean;
  projectRoot: string;
  selectedIds?: string[];
}

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ConversationAnalysis {
  repeatedPhrases: Array<{ phrase: string; count: number; examples: string[] }>;
  corrections: Array<{ original: string; correction: string; context: string }>;
  workflows: Array<{ steps: string[]; frequency: number }>;
}

export interface GitAnalysis {
  frequentPaths: Array<{ path: string; changeCount: number }>;
  commonMessages: Array<{ pattern: string; count: number }>;
  recentActivity: string[];
}

export interface ErrorAnalysis {
  typeErrors: Array<{ snippet: string; frequency: number }>;
  missingImports: Array<{ module: string; frequency: number }>;
  testFailures: Array<{ pattern: string; frequency: number }>;
}
