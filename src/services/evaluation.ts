/**
 * Evaluation utilities
 * Provide metrics for RAG quality assessment
 */

import type { SearchResult } from '../types/index';

export interface EvaluationMetrics {
  mrr: number; // Mean Reciprocal Rank
  precision_at_k: number;
  recall_at_k: number;
  ndcg: number; // Normalized Discounted Cumulative Gain
}

/**
 * Calculate Mean Reciprocal Rank (MRR)
 * Measures where the first relevant result appears
 */
export function calculateMRR(
  results: SearchResult[],
  relevantIds: Set<number>
): number {
  for (let i = 0; i < results.length; i++) {
    if (relevantIds.has(results[i]!.id)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Calculate Precision@K
 * Proportion of relevant documents in top K results
 */
export function calculatePrecisionAtK(
  results: SearchResult[],
  relevantIds: Set<number>,
  k: number
): number {
  const topK = results.slice(0, k);
  const relevantCount = topK.filter(r => relevantIds.has(r.id)).length;
  return topK.length > 0 ? relevantCount / topK.length : 0;
}

/**
 * Calculate Recall@K
 * Proportion of all relevant documents found in top K
 */
export function calculateRecallAtK(
  results: SearchResult[],
  relevantIds: Set<number>,
  k: number
): number {
  if (relevantIds.size === 0) return 0;

  const topK = results.slice(0, k);
  const relevantCount = topK.filter(r => relevantIds.has(r.id)).length;
  return relevantCount / relevantIds.size;
}

/**
 * Calculate Normalized Discounted Cumulative Gain (NDCG)
 * Considers both relevance and ranking position
 */
export function calculateNDCG(
  results: SearchResult[],
  relevanceScores: Map<number, number>,
  k: number
): number {
  const topK = results.slice(0, k);

  // Calculate DCG
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const result = topK[i]!;
    const relevance = relevanceScores.get(result.id) || 0;
    dcg += relevance / Math.log2(i + 2); // i+2 because log2(1) = 0
  }

  // Calculate ideal DCG (IDCG)
  const sortedRelevances = Array.from(relevanceScores.values())
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcg = 0;
  for (let i = 0; i < sortedRelevances.length; i++) {
    idcg += sortedRelevances[i]! / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}

/**
 * Evaluate a set of search results against ground truth
 */
export function evaluateResults(
  results: SearchResult[],
  relevantIds: Set<number>,
  k: number = 10
): EvaluationMetrics {
  const relevanceScores = new Map<number, number>();
  relevantIds.forEach(id => relevanceScores.set(id, 1));

  return {
    mrr: calculateMRR(results, relevantIds),
    precision_at_k: calculatePrecisionAtK(results, relevantIds, k),
    recall_at_k: calculateRecallAtK(results, relevantIds, k),
    ndcg: calculateNDCG(results, relevanceScores, k),
  };
}
