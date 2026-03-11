import os from 'os';
import path from 'path';
import { directoryExists, listDirectory } from './file-utils.js';

/**
 * Returns the Claude Code data directory for the current OS.
 *
 * | Platform | Path                                      |
 * |----------|-------------------------------------------|
 * | Linux    | ~/.claude                                 |
 * | macOS    | ~/.claude  (Claude Code uses XDG, not ~/Library) |
 * | Windows  | %APPDATA%\Claude  (fallback: ~/.claude)   |
 */
export function getClaudeDataDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (appData) return path.join(appData, 'Claude');
  }
  // Linux + macOS: Claude Code stores data in ~/.claude
  return path.join(os.homedir(), '.claude');
}

/**
 * Encode a project root path to the directory name Claude Code uses.
 *
 * Claude Code replaces every path separator (/ or \) and colon (:) with '-'.
 * Examples:
 *   /var/www/my-app      → -var-www-my-app
 *   C:\Users\joe\project → C--Users-joe-project
 */
export function encodeProjectPath(projectRoot: string): string {
  return projectRoot
    .replace(/[/\\]/g, '-')  // replace / and \ with -
    .replace(/:/g, '-');      // replace : (Windows drive letters) with -
}

/**
 * Find the Claude Code project data directory for a given project root.
 *
 * Strategy:
 * 1. Try the exact encoded path
 * 2. Scan all subdirectories of ~/.claude/projects/ and find the best match
 *    (useful if the encoding slightly differs between Claude Code versions)
 */
export async function findProjectDataDir(projectRoot: string): Promise<string | null> {
  const claudeDir = getClaudeDataDir();
  const projectsDir = path.join(claudeDir, 'projects');

  if (!(await directoryExists(projectsDir))) return null;

  // Try exact encoding first
  const encoded = encodeProjectPath(projectRoot);
  const exactPath = path.join(projectsDir, encoded);
  if (await directoryExists(exactPath)) return exactPath;

  // Fallback: find the best-matching project dir by basename
  const entries = await listDirectory(projectsDir);
  const basename = path.basename(projectRoot).toLowerCase();

  // Score each candidate: prefer dirs that end with the project basename
  const candidates = entries
    .map((name) => ({
      name,
      fullPath: path.join(projectsDir, name),
      score: scoreProjectDirMatch(name, projectRoot),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  if (candidates.length > 0) return candidates[0].fullPath;

  // Last resort: any dir that contains the basename
  const loose = entries.find((e) => e.toLowerCase().includes(basename));
  if (loose) return path.join(projectsDir, loose);

  return null;
}

/**
 * Score how well a Claude project dir name matches a given project root.
 * Higher is better. Returns 0 if no match.
 */
function scoreProjectDirMatch(dirName: string, projectRoot: string): number {
  // Normalize both to lower-case, replace separators with -
  const normalizedDir = dirName.toLowerCase();
  const normalizedRoot = projectRoot
    .toLowerCase()
    .replace(/[/\\:]/g, '-');

  if (normalizedDir === normalizedRoot) return 100;

  const basename = path.basename(projectRoot).toLowerCase();

  // Exact suffix match: -project-name
  if (normalizedDir.endsWith(`-${basename}`)) return 80;

  // Contains the basename somewhere
  if (normalizedDir.includes(basename)) return 50;

  return 0;
}

/**
 * Return all session JSONL files for a project, sorted newest first.
 */
export async function findSessionFiles(projectDataDir: string): Promise<string[]> {
  const entries = await listDirectory(projectDataDir);
  return entries
    .filter((e) => e.endsWith('.jsonl'))
    .map((e) => path.join(projectDataDir, e));
}
