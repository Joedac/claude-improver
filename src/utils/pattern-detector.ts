/**
 * General-purpose pattern detection utilities.
 * Finds repeated phrases, N-grams, and clusters of similar strings.
 */

export interface PhraseCounts {
  phrase: string;
  count: number;
  positions: number[];
}

/**
 * Extract normalized n-gram phrases from a list of strings.
 * Useful for finding repeated sub-sentences across conversation entries.
 */
export function extractRepeatedPhrases(
  texts: string[],
  minCount = 2,
  ngramSize = 4,
): PhraseCounts[] {
  const counts = new Map<string, { count: number; positions: number[] }>();

  texts.forEach((text, pos) => {
    const words = text
      .toLowerCase()
      // Keep letters (including accented/unicode), digits, spaces — strip punctuation only
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);

    for (let i = 0; i <= words.length - ngramSize; i++) {
      const phrase = words.slice(i, i + ngramSize).join(' ');
      const existing = counts.get(phrase);
      if (existing) {
        existing.count++;
        existing.positions.push(pos);
      } else {
        counts.set(phrase, { count: 1, positions: [pos] });
      }
    }
  });

  return Array.from(counts.entries())
    .filter(([, v]) => v.count >= minCount)
    .map(([phrase, v]) => ({ phrase, count: v.count, positions: v.positions }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Find lines matching a given keyword in a list of strings.
 */
export function findMatchingLines(texts: string[], keyword: string): string[] {
  const kw = keyword.toLowerCase();
  return texts.filter((t) => t.toLowerCase().includes(kw));
}

/**
 * Cluster similar strings by common leading tokens.
 */
export function clusterByPrefix(strings: string[], prefixWords = 3): Map<string, string[]> {
  const clusters = new Map<string, string[]>();

  for (const s of strings) {
    const key = s
      .toLowerCase()
      .split(/\s+/)
      .slice(0, prefixWords)
      .join(' ');

    const group = clusters.get(key);
    if (group) {
      group.push(s);
    } else {
      clusters.set(key, [s]);
    }
  }

  return clusters;
}

/**
 * Score impact based on frequency and confidence.
 * Returns a value 0-100.
 */
export function scoreImpact(frequency: number, confidence: number, baseScore = 50): number {
  const freqBonus = Math.min(frequency * 5, 30);
  const confBonus = confidence * 20;
  return Math.round(Math.min(baseScore + freqBonus + confBonus, 100));
}

/**
 * Map a numeric score to an impact label.
 */
export function scoreToImpact(score: number): 'low' | 'medium' | 'high' {
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

/**
 * Deduplicate an array of strings, case-insensitively.
 */
export function deduplicateStrings(strings: string[]): string[] {
  const seen = new Set<string>();
  return strings.filter((s) => {
    const key = s.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract the most common verbs / action words from a set of messages
 * (naive heuristic: first word of each sentence-like fragment).
 */
export function extractActionWords(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'it', 'i', 'you']);

  for (const text of texts) {
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    for (const word of words.slice(0, 3)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return counts;
}
