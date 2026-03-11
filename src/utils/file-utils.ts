import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function findFiles(pattern: string, cwd: string): Promise<string[]> {
  try {
    return await glob(pattern, { cwd, absolute: true, ignore: ['node_modules/**', 'dist/**', '.git/**'] });
  } catch {
    return [];
  }
}

export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function listDirectory(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((e) => e.name);
  } catch {
    return [];
  }
}

export function diffStrings(original: string, updated: string): string {
  const origLines = original.split('\n');
  const updLines = updated.split('\n');
  const lines: string[] = [];

  const maxLen = Math.max(origLines.length, updLines.length);
  let hasChanges = false;

  for (let i = 0; i < maxLen; i++) {
    const orig = origLines[i];
    const upd = updLines[i];

    if (orig === undefined) {
      lines.push(`+ ${upd}`);
      hasChanges = true;
    } else if (upd === undefined) {
      lines.push(`- ${orig}`);
      hasChanges = true;
    } else if (orig !== upd) {
      lines.push(`- ${orig}`);
      lines.push(`+ ${upd}`);
      hasChanges = true;
    } else {
      lines.push(`  ${orig}`);
    }
  }

  if (!hasChanges) return '(no changes)';
  return lines.join('\n');
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
