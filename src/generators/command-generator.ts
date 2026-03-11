import { DetectedPattern, Improvement } from '../types/index.js';
import { scoreImpact, scoreToImpact } from '../utils/pattern-detector.js';

interface CommandTemplate {
  name: string;
  description: string;
  skillRef?: string;
  steps: string[];
  args?: string;
}

const COMMAND_TEMPLATES: Record<string, CommandTemplate> = {
  'generate-tests': {
    name: 'generate-tests',
    description: 'Generate comprehensive tests for the target file',
    skillRef: 'generate-tests',
    args: '[file-path]',
    steps: [
      'Read and analyze the target file thoroughly',
      'Identify all public API surface (functions, classes, methods)',
      'Create a test file with the appropriate naming convention',
      'Write unit tests covering happy paths, edge cases, and error cases',
      'Run the tests to verify they pass',
      'Report coverage summary',
    ],
  },
  'generate-docs': {
    name: 'generate-docs',
    description: 'Generate JSDoc/TSDoc documentation for the codebase',
    skillRef: 'generate-docs',
    steps: [
      'Scan all source files for undocumented exports',
      'Generate JSDoc comments for each exported symbol',
      'Preserve existing documentation',
      'Run linting to verify doc format',
      'Report files updated',
    ],
  },
  'refactor': {
    name: 'refactor',
    description: 'Refactor the specified file or module',
    skillRef: 'refactor-code',
    args: '[file-path] [--focus=<concern>]',
    steps: [
      'Read the target file and identify code smells',
      'Plan the refactoring changes (no logic changes)',
      'Apply changes incrementally',
      'Run tests after each step',
      'Summarize all changes made',
    ],
  },
  'code-review': {
    name: 'code-review',
    description: 'Perform a code review of staged changes or a specified file',
    skillRef: 'code-review',
    args: '[file-path|--staged]',
    steps: [
      'Get the diff (staged changes or specified file)',
      'Review for correctness, security, and performance',
      'Format feedback by severity: MUST FIX / SHOULD FIX / CONSIDER',
      'Provide specific line references and suggested fixes',
    ],
  },
  'add-types': {
    name: 'add-types',
    description: 'Add TypeScript type annotations to the specified file',
    skillRef: 'add-types',
    args: '[file-path]',
    steps: [
      'Read the target file',
      'Infer types from usage context',
      'Add type annotations to function signatures and variables',
      'Run tsc --noEmit to verify no errors introduced',
      'Report summary of types added',
    ],
  },
};

export class CommandGenerator {
  generateFromPattern(pattern: DetectedPattern): Improvement | null {
    const template = this.selectTemplate(pattern);
    if (!template) return null;

    const score = scoreImpact(pattern.frequency, pattern.confidence, 60);
    const outputPath = `.claude/commands/${template.name}.md`;

    return {
      id: `command-${template.name}`,
      type: 'command',
      name: `/${template.name}`,
      reason: this.buildReason(pattern, template),
      impact: scoreToImpact(score),
      score,
      pattern,
      outputPath,
      generatedContent: this.renderCommand(template, pattern),
    };
  }

  private selectTemplate(pattern: DetectedPattern): CommandTemplate | null {
    if (pattern.type !== 'repetitive-workflow' && pattern.type !== 'repeated-prompt') {
      return null;
    }

    // hot-files = frequently modified file paths → not a workflow command
    if (pattern.id === 'hot-files') return null;

    const searchText = [
      ...(pattern.examples ?? []),
      JSON.stringify(pattern.metadata ?? {}),
    ]
      .join(' ')
      .toLowerCase();

    for (const [key, template] of Object.entries(COMMAND_TEMPLATES)) {
      const keywords = key.split('-');
      if (keywords.every((kw) => searchText.includes(kw))) {
        return template;
      }
    }

    // Only generate a command for high-frequency workflows
    if (pattern.frequency < 5) return null;

    const phrase = (pattern.metadata?.['label'] as string)
      ?? (pattern.metadata?.['phrase'] as string)
      ?? pattern.examples[0]
      ?? 'workflow';

    const name = phrase
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 30);

    return {
      name,
      description: `Execute the "${phrase}" workflow`,
      steps: [
        `Understand the full scope of the "${phrase}" request`,
        'Plan the steps needed',
        'Execute each step',
        'Verify results',
        'Summarize what was done',
      ],
    };
  }

  private buildReason(pattern: DetectedPattern, template: CommandTemplate): string {
    return `Workflow "${template.name}" repeated ${pattern.frequency} times — create /${template.name} command`;
  }

  private renderCommand(template: CommandTemplate, pattern: DetectedPattern): string {
    const examples = pattern.examples.slice(0, 3).map((e) => `- "${e}"`).join('\n');
    const stepsText = template.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');

    return `---
description: ${template.description}
auto-generated: true
generated-at: ${new Date().toISOString()}
---

# /${template.name}${template.args ? ` ${template.args}` : ''}

${template.description}

## Behavior

${stepsText}

## Detected usage patterns

${examples || '- (no examples recorded)'}

## Notes

- Auto-generated by claude-improver (${pattern.frequency} occurrences detected)
- Customize the steps above to match your project conventions
${template.skillRef ? `- Pairs with skill: \`${template.skillRef}\`` : ''}
`;
  }
}
