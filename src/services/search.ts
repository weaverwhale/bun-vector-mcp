import type { Database } from 'bun:sqlite';
import { getAllDocuments } from '../db/schema';
import { generateEmbedding } from './embeddings';
import type { SearchResult, SearchMetrics } from '../types/index';
import {
  SIMILARITY_THRESHOLD,
  DEFAULT_TOP_K,
  INITIAL_RETRIEVAL_K,
  QUESTION_WEIGHT,
  CONTENT_WEIGHT,
  ENABLE_RERANKING,
  ENABLE_DEDUPLICATION,
  ENABLE_QUERY_EXPANSION,
  LOG_SEARCH_METRICS,
} from '../constants/rag';
import { log } from '../utils/logger';
import { cosineSimilarity } from '../utils/vectors';
import {
  deduplicateResults,
  rerankResults,
  reciprocalRankFusion,
} from './rerank';
import { expandQuery } from './query-expansion';

/**
 * Enhanced hybrid search with query expansion, reranking, and deduplication
 */
export async function searchSimilar(
  db: Database,
  query: string,
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = SIMILARITY_THRESHOLD
): Promise<SearchResult[]> {
  const startTime = performance.now();

  log(`[searchSimilar] Starting enhanced hybrid search for query: "${query}"`);
  log(
    `[searchSimilar] Parameters: topK=${topK}, minSimilarity=${minSimilarity}`
  );

  // Get all documents from database once
  const documents = getAllDocuments(db);
  log(`[searchSimilar] Found ${documents.length} documents in database`);

  if (documents.length === 0) {
    log('[searchSimilar] No documents found, returning empty results');
    return [];
  }

  let allResults: SearchResult[] = [];

  // Stage 1: Query Expansion (if enabled)
  if (ENABLE_QUERY_EXPANSION) {
    log('[searchSimilar] Stage 1: Query expansion');
    const queryVariations = await expandQuery(query);
    log(`[searchSimilar] Generated ${queryVariations.length} query variations`);

    // Search with each query variation
    const resultSets: SearchResult[][] = [];
    for (const queryVar of queryVariations) {
      const results = await searchWithQuery(
        db,
        queryVar,
        documents,
        minSimilarity
      );
      resultSets.push(results);
    }

    // Combine results using Reciprocal Rank Fusion
    allResults = reciprocalRankFusion(resultSets);
    log(`[searchSimilar] RRF combined to ${allResults.length} unique results`);
  } else {
    // Single query search
    allResults = await searchWithQuery(db, query, documents, minSimilarity);
  }

  // Stage 2: Deduplication (if enabled)
  let dedupResults = allResults;
  if (ENABLE_DEDUPLICATION && allResults.length > 0) {
    log('[searchSimilar] Stage 2: Deduplication');
    dedupResults = deduplicateResults(allResults);
  }

  // Stage 3: Reranking (if enabled)
  let finalResults = dedupResults;
  if (ENABLE_RERANKING && dedupResults.length > 0) {
    log('[searchSimilar] Stage 3: Reranking');
    finalResults = rerankResults(dedupResults, query);
  }

  // Take top K
  finalResults = finalResults.slice(0, topK);

  const tookMs = Math.round((performance.now() - startTime) * 100) / 100;

  // Log metrics if enabled
  if (LOG_SEARCH_METRICS) {
    const metrics: SearchMetrics = {
      query,
      total_documents: documents.length,
      initial_results: allResults.length,
      after_deduplication: dedupResults.length,
      final_results: finalResults.length,
      avg_similarity:
        finalResults.length > 0
          ? finalResults.reduce((sum, r) => sum + r.similarity, 0) /
            finalResults.length
          : 0,
      took_ms: tookMs,
    };
    log(`[searchSimilar] Metrics: ${JSON.stringify(metrics)}`);
  }

  log(
    `[searchSimilar] Returning ${finalResults.length} results (took ${tookMs}ms)`
  );
  if (finalResults.length > 0) {
    log(
      `[searchSimilar] Top result: "${finalResults[0]!.filename}" (similarity: ${finalResults[0]!.similarity.toFixed(4)})`
    );
  }

  return finalResults;
}

/**
 * Search with a single query (internal helper)
 */
async function searchWithQuery(
  db: Database,
  query: string,
  documents: any[],
  minSimilarity: number
): Promise<SearchResult[]> {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Calculate hybrid similarity for each document
  const results = documents.map(doc => {
    let maxQuestionSimilarity = 0;

    // Calculate similarity against question embeddings if they exist
    if (doc.question_embeddings && doc.question_embeddings.length > 0) {
      for (const questionEmbedding of doc.question_embeddings) {
        const similarity = cosineSimilarity(queryEmbedding, questionEmbedding);
        maxQuestionSimilarity = Math.max(maxQuestionSimilarity, similarity);
      }
    }

    // Calculate similarity against content embedding
    const contentSimilarity = cosineSimilarity(queryEmbedding, doc.embedding);

    // Weighted hybrid score
    const hybridScore =
      maxQuestionSimilarity * QUESTION_WEIGHT +
      contentSimilarity * CONTENT_WEIGHT;

    return {
      id: doc.id,
      filename: doc.filename,
      chunk_text: doc.chunk_text,
      chunk_index: doc.chunk_index,
      similarity: hybridScore,
    };
  });

  // Sort by similarity (descending)
  results.sort((a, b) => b.similarity - a.similarity);

  // Filter by minimum similarity threshold and take initial top K
  const filteredResults = results
    .filter(result => result.similarity >= minSimilarity)
    .slice(0, INITIAL_RETRIEVAL_K);

  return filteredResults;
}
