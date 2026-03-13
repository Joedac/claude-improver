import { ConversationAnalysis, ConversationEntry, DetectedPattern } from '../types/index.js';
import { findFiles, readTextFile, directoryExists } from '../utils/file-utils.js';
import { extractRepeatedPhrases, clusterByPrefix, deduplicateStrings } from '../utils/pattern-detector.js';
import { getClaudeDataDir, findProjectDataDir, findSessionFiles } from '../utils/claude-paths.js';

/**
 * Phrases that indicate a message is a system/meta message, not a real user request.
 * Platform-agnostic: no hardcoded Unix paths.
 */
const NOISE_PATTERNS: RegExp[] = [
  /request interrupted by user/i,
  /interrupted by user for tool/i,
  /tool use was interrupted/i,
  /^[\s\[\]{}()<>|\\/*#@%^&=+~`]+$/,    // only symbols
  /^\s*\[.*?\]\s*$/,                      // only [bracket content]
  // Absolute paths on any platform (starts with /, \, or drive letter like C:\)
  /^([A-Za-z]:)?[/\\].{10,}/,
  // Looks like a file path embedded in a message
  /\b(node_modules|\.git|dist|build)[/\\]/,
];

const MIN_PHRASE_WORDS = 3;

const CORRECTION_SIGNALS = [
  'no, that',
  "that's wrong",
  'not quite',
  'actually,',
  'you should have',
  'wrong approach',
  'try again',
  'incorrect',
  'that is not',
  'please redo',
  'change it to',
  'replace that with',
  'not what i asked',
  // French equivalents
  'non, c\'est',
  'ce n\'est pas',
  'pas ce que je voulais',
  'recommence',
  'refais',
  'c\'est faux',
  'ce n\'est pas correct',
];

const REPEATED_TASK_SIGNALS = [
  'generate tests',
  'write tests',
  'add tests',
  'create tests',
  'write documentation',
  'generate docs',
  'add documentation',
  'create api docs',
  'refactor',
  'clean up',
  'add types',
  'fix typescript',
  'add error handling',
  // French equivalents
  'générer des tests',
  'écrire des tests',
  'ajouter des tests',
  'générer la documentation',
  'refactoriser',
  'ajouter les types',
];

interface ToolCallEntry {
  tool: string;
  command?: string;   // pour Bash
  filePath?: string;  // pour Read, Edit, Write, Glob
}

function normalizeBashCommand(cmd: string): string {
  const trimmed = cmd.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ');
  const exe = parts[0] ?? '';
  const multiWord = ['git', 'npm', 'npx', 'composer', 'python', 'python3', 'php', 'pytest', 'cargo', 'go', 'make'];
  if (multiWord.includes(exe) && parts[1]) {
    return `${exe} ${parts[1]}`;
  }
  return exe.slice(0, 30);
}

/**
 * Claude Code JSONL records that should be ignored (not user intents).
 */
const IGNORED_RECORD_TYPES = new Set([
  'file-history-snapshot',
  'tool_result',
  'system',
  'summary',
]);

export class ConversationAnalyzer {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async analyze(): Promise<{ patterns: DetectedPattern[]; stats: { conversationsAnalyzed: number } }> {
    const { entries, toolCalls } = await this.loadConversations();
    if (entries.length === 0) {
      return { patterns: [], stats: { conversationsAnalyzed: 0 } };
    }

    const analysis = this.analyzeEntries(entries);
    const patterns = [
      ...this.buildPatterns(analysis),
      ...this.analyzeToolCalls(toolCalls),
    ];

    return {
      patterns,
      stats: { conversationsAnalyzed: entries.length },
    };
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  private async loadConversations(): Promise<{ entries: ConversationEntry[]; toolCalls: ToolCallEntry[] }> {
    const entries: ConversationEntry[] = [];
    const toolCalls: ToolCallEntry[] = [];

    const push = (result: { entries: ConversationEntry[]; toolCalls: ToolCallEntry[] }) => {
      entries.push(...result.entries);
      toolCalls.push(...result.toolCalls);
    };

    // 1. Claude Code project-specific sessions (primary source)
    const projectDataDir = await findProjectDataDir(this.projectRoot);
    if (projectDataDir) {
      const sessionFiles = await findSessionFiles(projectDataDir);
      for (const file of sessionFiles.slice(0, 50)) {
        push(await this.loadJsonlFile(file));
      }
    }

    // 2. Fallback: project-local .claude/ dir
    const localClaudeDir = `${this.projectRoot}/.claude`;
    if (await directoryExists(localClaudeDir)) {
      const jsonlFiles = await findFiles('*.jsonl', localClaudeDir);
      for (const file of jsonlFiles.slice(0, 20)) {
        push(await this.loadJsonlFile(file));
      }
    }

    // 3. Fallback: global ~/.claude/*.jsonl
    if (entries.length === 0) {
      const globalDir = getClaudeDataDir();
      const globalJsonl = await findFiles('*.jsonl', globalDir);
      for (const file of globalJsonl.slice(0, 5)) {
        push(await this.loadJsonlFile(file));
      }
    }

    return { entries, toolCalls };
  }

  private async loadJsonlFile(filePath: string): Promise<{ entries: ConversationEntry[]; toolCalls: ToolCallEntry[] }> {
    const text = await readTextFile(filePath);
    if (!text) return { entries: [], toolCalls: [] };

    const entries: ConversationEntry[] = [];
    const toolCalls: ToolCallEntry[] = [];
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const record = JSON.parse(line);
        entries.push(...this.extractEntriesFromRecord(record));
        toolCalls.push(...this.extractToolCallsFromRecord(record));
      } catch {
        // skip malformed lines
      }
    }
    return { entries, toolCalls };
  }

  private extractToolCallsFromRecord(record: unknown): ToolCallEntry[] {
    if (!record || typeof record !== 'object') return [];
    const r = record as Record<string, unknown>;
    const msg = r['message'];
    if (!msg || typeof msg !== 'object') return [];
    const m = msg as Record<string, unknown>;
    if (m['role'] !== 'assistant') return [];

    const content = m['content'];
    if (!Array.isArray(content)) return [];

    const result: ToolCallEntry[] = [];
    for (const block of content as Array<Record<string, unknown>>) {
      if (block['type'] !== 'tool_use') continue;
      const tool = String(block['name'] ?? '');
      const input = (block['input'] ?? {}) as Record<string, unknown>;

      if (tool === 'Bash') {
        const cmd = String(input['command'] ?? '');
        if (cmd) result.push({ tool, command: normalizeBashCommand(cmd) });
      } else if (['Read', 'Edit', 'Write', 'Glob'].includes(tool)) {
        const fp = String(input['file_path'] ?? input['pattern'] ?? '');
        if (fp) result.push({ tool, filePath: fp });
      }
    }
    return result;
  }

  // ── Extraction ─────────────────────────────────────────────────────────────

  /**
   * Extract conversation entries from a Claude Code JSONL record.
   *
   * Claude Code session format:
   * { type: "user"|"assistant", message: { role, content: string | ContentBlock[] } }
   *
   * Content blocks: { type: "text", text: "..." } | { type: "tool_use", ... } | { type: "tool_result", ... }
   */
  private extractEntriesFromRecord(record: unknown): ConversationEntry[] {
    if (!record || typeof record !== 'object') return [];
    const r = record as Record<string, unknown>;

    // Skip known noise record types
    if (typeof r['type'] === 'string' && IGNORED_RECORD_TYPES.has(r['type'])) return [];

    const msg = r['message'];
    if (!msg || typeof msg !== 'object') return [];
    const m = msg as Record<string, unknown>;

    const role = m['role'];
    if (role !== 'user' && role !== 'assistant') return [];

    const content = this.extractTextContent(m['content']);
    if (!content.trim()) return [];

    return [{ role: role as 'user' | 'assistant', content }];
  }

  /**
   * Extract plain text from a content field that may be a string or ContentBlock[].
   * Skips tool_use and tool_result blocks to avoid polluting analysis with file contents.
   */
  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
      return (content as Array<Record<string, unknown>>)
        .filter((block) => block['type'] === 'text')
        .map((block) => String(block['text'] ?? ''))
        .join('\n')
        .trim();
    }

    return '';
  }

  // ── Analysis ───────────────────────────────────────────────────────────────

  private isNoise(text: string): boolean {
    if (!text || text.trim().length < 5) return true;
    if (NOISE_PATTERNS.some((re) => re.test(text.trim()))) return true;
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount < MIN_PHRASE_WORDS) return true;
    return false;
  }

  /**
   * Strip technical lines from a message before n-gram extraction:
   * - Lines that look like file paths (contain / or \ sequences)
   * - Lines that look like code (backtick blocks, JSON fragments)
   * - Very long lines (likely file contents)
   * Only keep lines that look like natural language.
   */
  private sanitizeMessage(msg: string): string {
    const lines = msg.split('\n');
    const kept = lines.filter((line) => {
      const t = line.trim();
      if (t.length === 0) return false;
      if (t.length > 200) return false;               // too long → likely code or file content
      if (/[/\\]{2,}/.test(t)) return false;          // double slashes → path
      if (/^\s*```/.test(t)) return false;            // code fence
      if (/^\s*[{[\]},;]/.test(t)) return false;     // JSON/code fragment
      if (/[/\\][a-zA-Z0-9._-]{2,}[/\\]/.test(t)) return false; // embedded path segment
      // Ratio of alphabetic chars: natural language is mostly letters
      const alpha = (t.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
      if (alpha / t.length < 0.4) return false;
      return true;
    });
    return kept.join(' ').replace(/\s+/g, ' ').trim();
  }

  private analyzeEntries(entries: ConversationEntry[]): ConversationAnalysis {
    const allUserMessages = entries.filter((e) => e.role === 'user').map((e) => e.content);
    // Sanitize before noise-filtering so we don't discard messages that have
    // a mix of natural language and code fragments
    const userMessages = allUserMessages
      .map((m) => this.sanitizeMessage(m))
      .filter((m) => !this.isNoise(m));

    // N-gram extraction: min 4 words per gram, min 3 occurrences
    const phrases = extractRepeatedPhrases(userMessages, 3, 4);
    const repeatedPhrases = phrases
      .filter((p) => !this.isNoise(p.phrase))
      .slice(0, 15)
      .map((p) => ({
        phrase: p.phrase,
        count: p.count,
        examples: userMessages.filter((m) => m.toLowerCase().includes(p.phrase)).slice(0, 3),
      }));

    // Corrections
    const corrections: ConversationAnalysis['corrections'] = [];
    for (let i = 1; i < entries.length; i++) {
      const curr = entries[i];
      const prev = entries[i - 1];
      if (curr.role !== 'user' || prev.role !== 'assistant') continue;

      const content = curr.content.toLowerCase();
      const isCorrection = CORRECTION_SIGNALS.some((sig) => content.includes(sig));
      if (isCorrection) {
        corrections.push({
          original: prev.content.slice(0, 200),
          correction: curr.content.slice(0, 200),
          context: `message index ${i}`,
        });
      }
    }

    // Repetitive workflows: clusters of similar user requests (min 4 occurrences)
    const clusters = clusterByPrefix(userMessages, 2);
    const workflows: ConversationAnalysis['workflows'] = [];
    for (const [prefix, messages] of clusters) {
      if (this.isNoise(prefix)) continue;
      if (messages.length < 4) continue;
      workflows.push({
        steps: deduplicateStrings(messages).slice(0, 5),
        frequency: messages.length,
      });
    }

    // Explicit task signals
    for (const signal of REPEATED_TASK_SIGNALS) {
      const matches = userMessages.filter((m) => m.toLowerCase().includes(signal));
      if (matches.length >= 3) {
        const exists = workflows.some((w) => w.steps.some((s) => s.toLowerCase().includes(signal)));
        if (!exists) {
          workflows.push({ steps: matches.slice(0, 5), frequency: matches.length });
        }
      }
    }

    return { repeatedPhrases, corrections, workflows };
  }

  // ── Tool call analysis ─────────────────────────────────────────────────────

  private analyzeToolCalls(toolCalls: ToolCallEntry[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Repeated Bash commands
    const bashCounts = new Map<string, number>();
    for (const tc of toolCalls) {
      if (tc.tool === 'Bash' && tc.command) {
        bashCounts.set(tc.command, (bashCounts.get(tc.command) ?? 0) + 1);
      }
    }
    for (const [command, count] of bashCounts) {
      if (count < 5) continue;
      patterns.push({
        id: `bash-${command.replace(/\s+/g, '-')}`,
        type: 'repetitive-workflow',
        frequency: count,
        examples: [`\`${command}\` exécuté ${count} fois`],
        confidence: Math.min(count / 15, 1),
        metadata: { source: 'tool-calls', tool: 'Bash', command },
      });
    }

    // Frequently edited files
    const fileCounts = new Map<string, number>();
    for (const tc of toolCalls) {
      if ((tc.tool === 'Edit' || tc.tool === 'Write') && tc.filePath) {
        fileCounts.set(tc.filePath, (fileCounts.get(tc.filePath) ?? 0) + 1);
      }
    }
    const hotFiles = [...fileCounts.entries()]
      .filter(([, count]) => count >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (hotFiles.length > 0) {
      patterns.push({
        id: 'tool-hot-files',
        type: 'repetitive-workflow',
        frequency: hotFiles.reduce((s, [, c]) => s + c, 0),
        examples: hotFiles.map(([f, c]) => `${f} (édité ${c}x)`),
        confidence: 0.7,
        metadata: { source: 'tool-calls', hotFiles: hotFiles.map(([p, count]) => ({ path: p, count })) },
      });
    }

    return patterns;
  }

  // ── Pattern building ───────────────────────────────────────────────────────

  private buildPatterns(analysis: ConversationAnalysis): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const phrase of analysis.repeatedPhrases.slice(0, 10)) {
      if (phrase.count < 3) continue;
      patterns.push({
        id: `repeated-prompt-${phrase.phrase.replace(/\s+/g, '-').slice(0, 30)}`,
        type: 'repeated-prompt',
        frequency: phrase.count,
        examples: phrase.examples.slice(0, 3),
        confidence: Math.min(phrase.count / 10, 1),
        metadata: { phrase: phrase.phrase },
      });
    }

    if (analysis.corrections.length > 0) {
      patterns.push({
        id: 'user-corrections',
        type: 'user-correction',
        frequency: analysis.corrections.length,
        examples: analysis.corrections.slice(0, 3).map((c) => c.correction),
        confidence: Math.min(analysis.corrections.length / 5, 1),
        metadata: { corrections: analysis.corrections.slice(0, 5) },
      });
    }

    for (const workflow of analysis.workflows.slice(0, 5)) {
      if (workflow.frequency < 3) continue;
      const key = workflow.steps[0]?.slice(0, 40) ?? 'workflow';
      patterns.push({
        id: `workflow-${key.replace(/\s+/g, '-')}`,
        type: 'repetitive-workflow',
        frequency: workflow.frequency,
        examples: workflow.steps.slice(0, 3),
        confidence: Math.min(workflow.frequency / 8, 1),
        metadata: { workflow },
      });
    }

    return patterns;
  }
}
