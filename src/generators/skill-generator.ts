import { DetectedPattern, Improvement } from '../types/index.js';
import { scoreImpact, scoreToImpact } from '../utils/pattern-detector.js';

interface SkillTemplate {
  name: string;
  description: string;
  trigger: string;
  instructions: string;
}

const SKILL_TEMPLATES: Record<string, SkillTemplate> = {
  'generate-tests': {
    name: 'generate-tests',
    description: 'Generate comprehensive tests for the current file or function',
    trigger: 'generate tests, write tests, add tests',
    instructions: `When asked to generate tests:
1. Analyze the target code thoroughly
2. Identify all public functions, methods, and edge cases
3. Write tests covering:
   - Happy path scenarios
   - Edge cases and boundary conditions
   - Error cases and exceptions
   - Integration points
4. Use the project's existing test framework and conventions
5. Ensure tests are deterministic and isolated
6. Add descriptive test names that explain what is being tested`,
  },
  'generate-docs': {
    name: 'generate-docs',
    description: 'Generate JSDoc/TSDoc documentation for code',
    trigger: 'generate docs, write documentation, add docs',
    instructions: `When asked to generate documentation:
1. Analyze all exported functions, classes, and types
2. Write clear, concise JSDoc/TSDoc comments including:
   - @description for complex logic
   - @param for each parameter with type and description
   - @returns describing what is returned
   - @throws for documented exceptions
   - @example with practical usage examples
3. Follow the project's existing documentation style
4. Avoid stating the obvious - focus on non-trivial behavior`,
  },
  'generate-api-docs': {
    name: 'generate-api-docs',
    description: 'Generate API documentation in OpenAPI/Markdown format',
    trigger: 'api docs, api documentation, document endpoints',
    instructions: `When asked to document APIs:
1. Identify all HTTP endpoints, their methods, paths, and handlers
2. Document each endpoint with:
   - Method and path
   - Description of what it does
   - Request body schema (if applicable)
   - Query parameters
   - Response schemas for success and error cases
   - Authentication requirements
3. Use OpenAPI 3.0 format if a spec file exists, otherwise use Markdown
4. Include realistic example requests and responses`,
  },
  'refactor-code': {
    name: 'refactor-code',
    description: 'Refactor code for clarity, performance, and maintainability',
    trigger: 'refactor, clean up code, improve code quality',
    instructions: `When asked to refactor code:
1. Identify code smells: duplication, long functions, deep nesting, magic numbers
2. Extract reusable functions and constants
3. Improve naming for clarity
4. Reduce cyclomatic complexity
5. Apply SOLID principles where appropriate
6. Preserve all existing functionality (verify with tests)
7. Document non-obvious design decisions
8. Keep changes minimal — refactor one concern at a time`,
  },
  'add-types': {
    name: 'add-types',
    description: 'Add TypeScript type annotations to untyped or loosely-typed code',
    trigger: 'add types, add TypeScript types, fix types',
    instructions: `When adding TypeScript types:
1. Infer types from usage and context before making them explicit
2. Prefer specific types over \`any\` or \`unknown\`
3. Create interfaces/types for complex object shapes
4. Add return types to all exported functions
5. Use generics where appropriate to maintain flexibility
6. Enable strict mode checks if not already enabled
7. Fix resulting type errors without widening types unnecessarily`,
  },
  'code-review': {
    name: 'code-review',
    description: 'Perform a thorough code review with actionable feedback',
    trigger: 'code review, review this, review PR',
    instructions: `When reviewing code:
1. Check for correctness: logic errors, edge cases, off-by-one errors
2. Security: input validation, SQL injection, XSS, auth issues
3. Performance: unnecessary loops, N+1 queries, memory leaks
4. Maintainability: clarity, naming, duplication
5. Test coverage: are edge cases tested?
6. TypeScript: proper typing, no unsafe casts
7. Format feedback as:
   - 🔴 MUST FIX: blocking issues
   - 🟡 SHOULD FIX: important improvements
   - 🟢 CONSIDER: optional suggestions`,
  },
  'fix-lint': {
    name: 'fix-lint',
    description: 'Fix all ESLint/Prettier issues in the codebase',
    trigger: 'fix lint, fix linting, eslint errors',
    instructions: `When fixing lint issues:
1. Run the linter to get a full list of errors and warnings
2. Fix errors first (blocking issues), then warnings
3. For auto-fixable issues, run \`eslint --fix\` / \`prettier --write\`
4. For manual fixes, address each issue without changing logic
5. Do not disable lint rules unless absolutely necessary
6. If a rule seems wrong for the codebase, discuss before disabling`,
  },
};

export class SkillGenerator {
  generateFromPattern(pattern: DetectedPattern): Improvement | null {
    const template = this.selectTemplate(pattern);
    if (!template) return null;

    const score = scoreImpact(pattern.frequency, pattern.confidence);
    const outputPath = `.claude/skills/${template.name}.md`;

    return {
      id: `skill-${template.name}`,
      type: 'skill',
      name: template.name,
      reason: this.buildReason(pattern),
      impact: scoreToImpact(score),
      score,
      pattern,
      outputPath,
      generatedContent: this.renderSkill(template, pattern),
    };
  }

  private selectTemplate(pattern: DetectedPattern): SkillTemplate | null {
    // Match by metadata or examples
    const searchText = [
      ...(pattern.examples ?? []),
      JSON.stringify(pattern.metadata ?? {}),
    ]
      .join(' ')
      .toLowerCase();

    for (const [key, template] of Object.entries(SKILL_TEMPLATES)) {
      const keywords = key.split('-').concat(template.trigger.split(/[,\s]+/));
      if (keywords.some((kw) => searchText.includes(kw.toLowerCase()))) {
        return template;
      }
    }

    // Generic skill for repeated prompts
    if (pattern.type === 'repeated-prompt') {
      const phrase = (pattern.metadata?.['phrase'] as string) ?? pattern.examples[0] ?? 'task';
      const name = phrase
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 30);

      return {
        name,
        description: `Handle the repeated request: "${phrase}"`,
        trigger: phrase,
        instructions: `When asked to "${phrase}":
1. Understand the full scope of the request
2. Break it into clear, actionable steps
3. Execute each step systematically
4. Verify results before presenting them
5. Summarize what was done`,
      };
    }

    return null;
  }

  private buildReason(pattern: DetectedPattern): string {
    switch (pattern.type) {
      case 'repeated-prompt':
        return `Prompt repeated ${pattern.frequency} times — automate with a skill`;
      case 'repetitive-workflow':
        return `Workflow detected ${pattern.frequency} times — create reusable skill`;
      case 'user-correction':
        return `${pattern.frequency} corrections recorded — improve default behavior`;
      default:
        return `Pattern detected ${pattern.frequency} times`;
    }
  }

  private renderSkill(template: SkillTemplate, pattern: DetectedPattern): string {
    const examples = pattern.examples.slice(0, 3).map((e) => `- "${e}"`).join('\n');

    return `---
name: ${template.name}
description: ${template.description}
trigger: ${template.trigger}
version: 1.0.0
auto-generated: true
generated-at: ${new Date().toISOString()}
---

# ${template.name}

${template.description}

## When to use

This skill is triggered when the user asks to: **${template.trigger}**

**Detected examples from your history:**
${examples || '- (no examples recorded yet)'}

## Instructions

${template.instructions}

## Notes

- Auto-generated by claude-improver based on ${pattern.frequency} detected occurrences
- Review and customize these instructions to match your project's conventions
- Confidence score: ${Math.round(pattern.confidence * 100)}%
`;
  }
}
