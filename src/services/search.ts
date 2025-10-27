import type { Database } from 'bun:sqlite';
import { getAllDocuments } from '../db/schema';
import { generateEmbedding } from './embeddings';
import type { SearchResult } from '../types/index';
import {
  SIMILARITY_THRESHOLD,
  DEFAULT_TOP_K,
  QUESTION_WEIGHT,
  CONTENT_WEIGHT,
} from '../constants/rag';
import { log } from '../utils/logger';
import { cosineSimilarity } from '../utils/vectors';
import { normalizeForEmbedding } from '../utils/text';
import {
  validateQueryInput,
  validateTopK,
  validateSimilarityThreshold,
} from '../utils/errors';

/**
 * Hybrid semantic search combining question and content embeddings
 */
export async function searchSimilar(
  db: Database,
  query: string,
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = SIMILARITY_THRESHOLD
): Promise<SearchResult[]> {
  // Validate inputs
  validateQueryInput(query);
  validateTopK(topK);
  validateSimilarityThreshold(minSimilarity);

  const startTime = performance.now();

  log(`[searchSimilar] Searching for: "${query}"`);

  // Get all documents from database
  const documents = getAllDocuments(db);

  if (documents.length === 0) {
    log('[searchSimilar] No documents in database');
    return [];
  }

  // Generate query embedding with normalization to handle spelling variations
  const normalizedQuery = normalizeForEmbedding(query);
  const queryEmbedding = await generateEmbedding(normalizedQuery);

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

  // Sort by similarity and filter by threshold
  const sortedResults = results
    .filter(result => result.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  // Deduplicate by text content - keep only the highest-scoring occurrence of each unique text
  const seenTexts = new Set<string>();
  const deduplicatedResults: SearchResult[] = [];

  for (const result of sortedResults) {
    if (!seenTexts.has(result.chunk_text)) {
      seenTexts.add(result.chunk_text);
      deduplicatedResults.push(result);
    }
  }

  const filteredResults = deduplicatedResults.slice(0, topK);

  const tookMs = Math.round((performance.now() - startTime) * 100) / 100;

  log(
    `[searchSimilar] Found ${sortedResults.length} results, ${deduplicatedResults.length} unique after deduplication, returning ${filteredResults.length} (took ${tookMs}ms)`
  );

  return filteredResults;
}
