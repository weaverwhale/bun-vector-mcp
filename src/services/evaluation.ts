/**
 * Evaluation and monitoring service
 * Provides metrics for assessing RAG quality
 */

import type { SearchResult } from '../types/index';
import { log } from '../utils/logger';

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

/**
 * Validate answer faithfulness to context
 * Checks if answer content is supported by the provided context
 */
export function validateAnswerFaithfulness(
  answer: string,
  context: string
): { faithful: boolean; confidence: number; issues: string[] } {
  const issues: string[] = [];

  // Extract key claims from answer (simple sentence-based approach)
  const answerSentences = answer
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (answerSentences.length === 0) {
    return { faithful: true, confidence: 1.0, issues: [] };
  }

  let supportedCount = 0;
  const contextLower = context.toLowerCase();

  for (const sentence of answerSentences) {
    const sentenceLower = sentence.toLowerCase();

    // Extract key terms (nouns, verbs - simple word-based approach)
    const keyTerms = sentenceLower
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4); // Longer words are more significant

    if (keyTerms.length === 0) continue;

    // Check if majority of key terms appear in context
    const matchCount = keyTerms.filter(term =>
      contextLower.includes(term)
    ).length;
    const coverage = matchCount / keyTerms.length;

    if (coverage >= 0.5) {
      supportedCount++;
    } else {
      issues.push(
        `Low context support for: "${sentence.substring(0, 100)}..."`
      );
    }
  }

  const faithfulnessScore = supportedCount / answerSentences.length;
  const faithful = faithfulnessScore >= 0.7;

  if (!faithful) {
    log(
      `[validateAnswerFaithfulness] Low faithfulness score: ${faithfulnessScore.toFixed(2)}`
    );
  }

  return {
    faithful,
    confidence: faithfulnessScore,
    issues,
  };
}

/**
 * Calculate answer confidence based on source similarities
 */
export function calculateAnswerConfidence(sources: SearchResult[]): number {
  if (sources.length === 0) return 0;

  // Confidence based on:
  // 1. Average similarity of sources
  // 2. Number of sources
  // 3. Consistency across sources

  const avgSimilarity =
    sources.reduce((sum, s) => sum + s.similarity, 0) / sources.length;

  // More sources (up to a point) increase confidence
  const sourceBoost = Math.min(sources.length / 5, 1.0) * 0.2;

  // Consistency: variance in similarity scores (lower variance = more consistent)
  const variance =
    sources.reduce(
      (sum, s) => sum + Math.pow(s.similarity - avgSimilarity, 2),
      0
    ) / sources.length;
  const consistencyScore = Math.max(0, 1 - variance) * 0.1;

  const confidence = Math.min(
    avgSimilarity + sourceBoost + consistencyScore,
    1.0
  );

  return confidence;
}

/**
 * Detect potential hallucinations in generated answer
 */
export function detectHallucinations(
  answer: string,
  sources: SearchResult[]
): { hasHallucination: boolean; suspiciousPhrases: string[] } {
  const suspiciousPhrases: string[] = [];
  const combinedContext = sources
    .map(s => s.chunk_text.toLowerCase())
    .join(' ');

  // Check for absolute statements not in context
  const absolutePatterns = [
    /always\s+\w+/gi,
    /never\s+\w+/gi,
    /all\s+\w+\s+(are|must|should)/gi,
    /every\s+\w+\s+(is|are)/gi,
  ];

  for (const pattern of absolutePatterns) {
    const matches = answer.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!combinedContext.includes(match.toLowerCase())) {
          suspiciousPhrases.push(match);
        }
      }
    }
  }

  // Check for specific numbers/dates not in context
  const numberPattern =
    /\b\d+(\.\d+)?(%|kg|lbs|years?|months?|weeks?|days?)?\b/gi;
  const answerNumbers = answer.match(numberPattern) || [];

  for (const num of answerNumbers) {
    if (!combinedContext.includes(num.toLowerCase())) {
      suspiciousPhrases.push(num);
    }
  }

  return {
    hasHallucination: suspiciousPhrases.length > 0,
    suspiciousPhrases,
  };
}

/**
 * Log query metrics for monitoring
 */
export function logQueryMetrics(metrics: {
  query: string;
  results_count: number;
  avg_similarity: number;
  took_ms: number;
  confidence?: number;
}): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    ...metrics,
  };

  log(`[QueryMetrics] ${JSON.stringify(logEntry)}`);

  // In production, you would write this to a metrics database or file
  // For now, we just log it
}
