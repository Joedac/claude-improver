import path from 'path';
import { AppliedImprovement, ImprovementHistory, Improvement } from '../types/index.js';
import { readJsonFile, writeJsonFile } from '../utils/file-utils.js';

const HISTORY_VERSION = '1.0.0';

export class ImprovementHistoryStore {
  private historyPath: string;

  constructor(projectRoot: string) {
    this.historyPath = path.join(projectRoot, '.claude', 'improvement-history.json');
  }

  async load(): Promise<ImprovementHistory> {
    const data = await readJsonFile<ImprovementHistory>(this.historyPath);
    return data ?? { version: HISTORY_VERSION, improvements: [] };
  }

  async record(improvements: Improvement[]): Promise<void> {
    const history = await this.load();
    const now = new Date().toISOString();

    for (const imp of improvements) {
      // Remove existing entry for same id (idempotent)
      const idx = history.improvements.findIndex((h) => h.id === imp.id);
      if (idx !== -1) history.improvements.splice(idx, 1);

      history.improvements.push({
        id: imp.id,
        name: imp.name,
        type: imp.type,
        appliedAt: now,
        outputPath: imp.outputPath,
      });
    }

    await writeJsonFile(this.historyPath, history);
  }

  async getApplied(): Promise<AppliedImprovement[]> {
    const history = await this.load();
    return history.improvements;
  }

  async wasApplied(id: string): Promise<boolean> {
    const history = await this.load();
    return history.improvements.some((i) => i.id === id);
  }

  formatHistory(): string {
    return '';
  }

  async renderHistory(): Promise<string> {
    const history = await this.load();
    if (history.improvements.length === 0) {
      return 'No improvements applied yet.';
    }

    const rows = history.improvements
      .slice()
      .reverse()
      .slice(0, 20)
      .map((i) => `  ${i.appliedAt.slice(0, 10)}  ${i.type.padEnd(10)}  ${i.name.padEnd(30)}  ${i.outputPath}`);

    return [
      'Applied improvements:',
      '',
      '  DATE        TYPE        NAME                            PATH',
      '  ----------  ----------  ------------------------------  ----',
      ...rows,
    ].join('\n');
  }
}
