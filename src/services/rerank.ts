/**
 * Reranking and result enhancement service
 * Implements two-stage retrieval, deduplication, and advanced scoring
 */

import type { SearchResult } from '../types/index';
import { cosineSimilarity } from '../utils/vectors';
import { DEDUPLICATION_THRESHOLD, RERANK_TOP_K } from '../constants/rag';
import { log } from '../utils/logger';

/**
 * Remove near-duplicate results based on text similarity
 * Keeps the result with higher similarity score
 */
export function deduplicateResults(
  results: SearchResult[],
  threshold: number = DEDUPLICATION_THRESHOLD
): SearchResult[] {
  if (results.length === 0) return results;

  const deduplicated: SearchResult[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < results.length; i++) {
    if (seen.has(i)) continue;

    const current = results[i]!;
    deduplicated.push(current);
    seen.add(i);

    // Check for duplicates against remaining results
    for (let j = i + 1; j < results.length; j++) {
      if (seen.has(j)) continue;

      const candidate = results[j]!;

      // Check if from same document at adjacent positions
      if (
        current.filename === candidate.filename &&
        current.chunk_index !== undefined &&
        candidate.chunk_index !== undefined &&
        Math.abs(current.chunk_index - candidate.chunk_index) <= 1
      ) {
        // Adjacent chunks from same doc, calculate text similarity
        const textSim = calculateTextSimilarity(
          current.chunk_text,
          candidate.chunk_text
        );

        if (textSim >= threshold) {
          // Mark as duplicate, keep the one with higher similarity
          if (candidate.similarity > current.similarity) {
            // Replace current with candidate
            deduplicated[deduplicated.length - 1] = candidate;
          }
          seen.add(j);
        }
      }
    }
  }

  log(
    `[deduplicateResults] Reduced from ${results.length} to ${deduplicated.length} results`
  );
  return deduplicated;
}

/**
 * Calculate text similarity using simple token overlap (Jaccard similarity)
 * More efficient than embedding for deduplication
 */
function calculateTextSimilarity(text1: string, text2: string): number {
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
 * Rerank results using reciprocal rank fusion (RRF)
 * Combines multiple search strategies for better results
 */
export function reciprocalRankFusion(
  resultSets: SearchResult[][],
  k: number = 60
): SearchResult[] {
  const scoreMap = new Map<number, { result: SearchResult; score: number }>();

  for (const results of resultSets) {
    results.forEach((result, rank) => {
      const rrfScore = 1 / (k + rank + 1);

      if (scoreMap.has(result.id)) {
        const existing = scoreMap.get(result.id)!;
        existing.score += rrfScore;
      } else {
        scoreMap.set(result.id, {
          result: { ...result, rerank_score: rrfScore },
          score: rrfScore,
        });
      }
    });
  }

  // Sort by RRF score
  const reranked = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(item => ({
      ...item.result,
      rerank_score: item.score,
    }));

  log(
    `[reciprocalRankFusion] Combined ${resultSets.length} result sets into ${reranked.length} unique results`
  );
  return reranked;
}

/**
 * Rerank using enhanced scoring that considers multiple factors
 */
export function rerankResults(
  results: SearchResult[],
  query: string
): SearchResult[] {
  if (results.length === 0) return results;

  log(`[rerankResults] Reranking ${results.length} results`);

  const reranked = results.map(result => {
    // Base score is the similarity score
    let score = result.similarity;

    // Boost for query term matches
    const queryTerms = query.toLowerCase().split(/\s+/);
    const textLower = result.chunk_text.toLowerCase();
    const termMatches = queryTerms.filter(term =>
      textLower.includes(term)
    ).length;
    const termBoost = (termMatches / queryTerms.length) * 0.1;

    // Boost for chunk position (earlier chunks often contain key information)
    const positionBoost =
      result.chunk_index !== undefined
        ? Math.max(0, 0.05 - result.chunk_index * 0.005)
        : 0;

    // Penalty for very short chunks (might be incomplete)
    const lengthPenalty = result.chunk_text.length < 200 ? -0.05 : 0;

    score += termBoost + positionBoost + lengthPenalty;

    return {
      ...result,
      rerank_score: score,
      similarity: score, // Update similarity with reranked score
    };
  });

  // Sort by new score
  reranked.sort(
    (a, b) =>
      (b.rerank_score || b.similarity) - (a.rerank_score || a.similarity)
  );

  // Take top K
  const topK = reranked.slice(0, RERANK_TOP_K);
  log(`[rerankResults] Returned top ${topK.length} results after reranking`);

  return topK;
}
