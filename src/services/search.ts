import type { Database } from 'bun:sqlite';
import { generateEmbedding } from './embeddings';
import type { SearchResult } from '../types/index';
import {
  SIMILARITY_THRESHOLD,
  DEFAULT_TOP_K,
  QUESTION_WEIGHT,
  CONTENT_WEIGHT,
} from '../constants/rag';
import { log } from '../utils/logger';
import { dotProduct, deserializeVectors } from '../utils/vectors';
import { normalizeForEmbedding } from '../utils/text';
import {
  validateQueryInput,
  validateTopK,
  validateSimilarityThreshold,
} from '../utils/errors';

/**
 * Fast hybrid semantic search using sqlite-vec for content embeddings
 * and JavaScript for question embeddings
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

  // Generate query embedding with normalization to handle spelling variations
  const normalizedQuery = normalizeForEmbedding(query);
  const queryEmbedding = await generateEmbedding(normalizedQuery);

  // Convert to Float32Array for sqlite-vec
  // When binding vector parameters to sqlite-vec functions, wrap the Float32Array
  // in a Uint8Array using its .buffer accessor for proper binary passing
  const queryVector = new Float32Array(queryEmbedding);
  const queryVectorBlob = new Uint8Array(queryVector.buffer);

  // Use vec0 virtual table with MATCH operator for indexed KNN search
  // This uses vector indexes (HNSW/IVF) for O(log n) search instead of O(n) full scan
  // The k parameter tells vec0 how many nearest neighbors to find efficiently
  // Fetch extra candidates for hybrid scoring, threshold filtering, and deduplication
  const candidateLimit = Math.max(topK * 25, 200); // Get 25x candidates for hybrid reranking

  const stmt = db.prepare(`
    SELECT 
      d.id, 
      d.filename, 
      d.chunk_text, 
      d.chunk_index,
      d.question_embeddings,
      v.distance
    FROM vec_embeddings v
    INNER JOIN documents d ON v.document_id = d.id
    WHERE v.embedding MATCH ? AND k = ?
    ORDER BY v.distance
  `);

  const rows = stmt.all(queryVectorBlob, candidateLimit) as Array<{
    id: number;
    filename: string;
    chunk_text: string;
    chunk_index: number;
    question_embeddings: Uint8Array | null;
    distance: number;
  }>;

  if (rows.length === 0) {
    log('[searchSimilar] No documents in database');
    return [];
  }

  // Calculate hybrid similarity for each document
  // Convert distance (0-2) to similarity (0-1) where higher is better
  const results = rows.map(row => {
    const contentSimilarity = 1.0 - row.distance / 2.0;
    let maxQuestionSimilarity = 0;

    // Calculate similarity against question embeddings if they exist
    if (row.question_embeddings) {
      const questionEmbeddings = deserializeVectors(row.question_embeddings);
      for (const questionEmbedding of questionEmbeddings) {
        const similarity = dotProduct(queryEmbedding, questionEmbedding);
        if (similarity > maxQuestionSimilarity) {
          maxQuestionSimilarity = similarity;
        }
      }
    }

    // Weighted hybrid score
    const hybridScore =
      maxQuestionSimilarity * QUESTION_WEIGHT +
      contentSimilarity * CONTENT_WEIGHT;

    return {
      id: row.id,
      filename: row.filename,
      chunk_text: row.chunk_text,
      chunk_index: row.chunk_index,
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
    `[searchSimilar] Processed ${rows.length} candidates, found ${deduplicatedResults.length} unique results above threshold, returning ${filteredResults.length} (took ${tookMs}ms)`
  );

  return filteredResults;
}
