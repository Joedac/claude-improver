import path from 'path';
import { AppliedImprovement, ImprovementHistory, Improvement, RejectedImprovement } from '../types/index.js';
import { readJsonFile, writeJsonFile } from '../utils/file-utils.js';

const HISTORY_VERSION = '1.0.0';

export class ImprovementHistoryStore {
  private historyPath: string;

  constructor(projectRoot: string) {
    this.historyPath = path.join(projectRoot, '.claude', 'improvement-history.json');
  }

  async load(): Promise<ImprovementHistory> {
    const data = await readJsonFile<ImprovementHistory>(this.historyPath);
    if (!data) return { version: HISTORY_VERSION, improvements: [], rejections: [] };
    if (!data.rejections) data.rejections = [];
    return data;
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

  async recordRejections(improvements: Improvement[]): Promise<void> {
    const history = await this.load();
    const now = new Date().toISOString();

    for (const imp of improvements) {
      const idx = history.rejections.findIndex((r) => r.id === imp.id);
      if (idx !== -1) history.rejections.splice(idx, 1);
      history.rejections.push({ id: imp.id, name: imp.name, type: imp.type, rejectedAt: now });
    }

    await writeJsonFile(this.historyPath, history);
  }

  async wasRejected(id: string): Promise<boolean> {
    const history = await this.load();
    return history.rejections.some((r) => r.id === id);
  }

  async getRejectedIds(): Promise<Set<string>> {
    const history = await this.load();
    return new Set(history.rejections.map((r) => r.id));
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
