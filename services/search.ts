import type { Database } from 'bun:sqlite';
import { getAllDocuments } from '../db/schema.ts';
import { generateEmbedding } from './embeddings.ts';
import type { SearchResult } from '../types/index.ts';
import { SIMILARITY_THRESHOLD, DEFAULT_TOP_K } from '../constants.ts';
import { log } from '../utils/logger.ts';

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vectors must have the same length (query: ${a.length}, stored: ${b.length})`
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    magnitudeA += a[i]! * a[i]!;
    magnitudeB += b[i]! * b[i]!;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

export async function searchSimilar(
  db: Database,
  query: string,
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = SIMILARITY_THRESHOLD
): Promise<SearchResult[]> {
  log(`[searchSimilar] Starting search for query: "${query}"`);
  log(
    `[searchSimilar] Parameters: topK=${topK}, minSimilarity=${minSimilarity}`
  );

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  log(
    `[searchSimilar] Generated embedding with ${queryEmbedding.length} dimensions`
  );

  // Get all documents from database
  const documents = getAllDocuments(db);
  log(`[searchSimilar] Found ${documents.length} documents in database`);

  if (documents.length === 0) {
    log('[searchSimilar] No documents found, returning empty results');
    return [];
  }

  // Calculate similarity for each document
  const results = documents.map(doc => ({
    id: doc.id,
    filename: doc.filename,
    chunk_text: doc.chunk_text,
    similarity: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  // Sort by similarity (descending)
  results.sort((a, b) => b.similarity - a.similarity);

  // Filter by minimum similarity threshold and take top K
  const filteredResults = results
    .filter(result => result.similarity >= minSimilarity)
    .slice(0, topK);

  log(`[searchSimilar] Returning ${filteredResults.length} results`);
  if (filteredResults.length > 0) {
    log(
      `[searchSimilar] Top result: "${filteredResults[0]!.filename}" (similarity: ${filteredResults[0]!.similarity.toFixed(4)})`
    );
  }

  return filteredResults;
}
