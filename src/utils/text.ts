/**
 * Text processing utilities
 * Shared functions for text analysis and similarity
 */

/**
 * Calculate Jaccard similarity between two texts
 * Used for deduplication and text overlap detection
 */
export function calculateJaccardSimilarity(
  text1: string,
  text2: string
): number {
  const tokens1 = new Set(
    text1
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );

  const tokens2 = new Set(
    text2
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );

  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
}

/**
 * Tokenize text into words (for text analysis)
 */
export function tokenize(text: string, minLength: number = 3): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= minLength);
}

/**
 * Split text into sentences
 */
export function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)/g;
  let match;

  while ((match = sentenceRegex.exec(text)) !== null) {
    sentences.push(match[0].trim());
  }

  // If no matches, return the whole text as one sentence
  if (sentences.length === 0) {
    return [text];
  }

  return sentences;
}

/**
 * Extract key phrases from text (for fallback question generation)
 */
export function extractKeyPhrase(text: string, maxWords: number = 3): string {
  const stopWords = new Set([
    'this',
    'that',
    'with',
    'from',
    'have',
    'been',
    'will',
    'would',
    'could',
    'should',
    'there',
    'their',
    'these',
    'those',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, maxWords);

  return words.join(' ') || 'this topic';
}

/**
 * Clean and normalize text
 */
export function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}
