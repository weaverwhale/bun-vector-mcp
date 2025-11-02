import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  EMBEDDING_MODEL,
  AI_BASE_URL,
  AI_API_KEY,
} from '../constants/providers';
import { log, error } from '../utils/logger';
import { normalizeVector } from '../utils/vectors';
import { withRetry, EmbeddingError } from '../utils/errors';

// Prevent reinitialization during HMR in development
if (typeof global !== 'undefined') {
  (global as any).__AI_PROVIDER_CACHE =
    (global as any).__AI_PROVIDER_CACHE || null;
}

// AI SDK provider
let aiProvider: ReturnType<typeof createOpenAI> | null = null;

// Embedding cache for duplicate texts
const embeddingCache = new Map<string, number[]>();
let embeddingModelVersion: string | null = null;

export function getEmbeddingModelVersion(): string {
  return embeddingModelVersion || EMBEDDING_MODEL;
}

export async function initializeEmbeddings(): Promise<void> {
  // Check if already initialized or cached
  if (aiProvider || (global as any).__AI_PROVIDER_CACHE) {
    aiProvider = aiProvider || (global as any).__AI_PROVIDER_CACHE;
    embeddingModelVersion = embeddingModelVersion || EMBEDDING_MODEL;
    return;
  }

  log('Using AI SDK with embeddings model:', EMBEDDING_MODEL);
  log('Base URL:', AI_BASE_URL);

  aiProvider = createOpenAI({
    baseURL: AI_BASE_URL,
    apiKey: AI_API_KEY,
  });

  // Cache for HMR
  (global as any).__AI_PROVIDER_CACHE = aiProvider;
  embeddingModelVersion = EMBEDDING_MODEL;
}

export async function generateEmbedding(
  text: string,
  normalize: boolean = true,
  useCache: boolean = true
): Promise<number[]> {
  // Check cache first
  if (useCache && embeddingCache.has(text)) {
    return embeddingCache.get(text)!;
  }

  try {
    if (!aiProvider) {
      await initializeEmbeddings();
    }

    if (!aiProvider) {
      throw new EmbeddingError('Failed to initialize AI provider');
    }

    const result = await withRetry(
      async () =>
        embed({
          model: aiProvider!.embedding(EMBEDDING_MODEL),
          value: text,
        }),
      { retryableErrors: [EmbeddingError] }
    );

    let embedding = result.embedding;

    // Normalize if requested
    if (normalize) {
      embedding = normalizeVector(embedding);
    }

    // Cache the result
    if (useCache && embeddingCache.size < 10000) {
      // Limit cache size
      embeddingCache.set(text, embedding);
    }

    return embedding;
  } catch (err) {
    error('Error generating embedding:', err);
    throw new EmbeddingError(
      `Failed to generate embedding: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }
}

/**
 * Generate embeddings for multiple texts with batching support
 * Significantly faster than sequential processing
 */
export async function generateEmbeddings(
  texts: string[],
  normalize: boolean = true,
  batchSize: number = 10
): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    if (!aiProvider) {
      await initializeEmbeddings();
    }

    if (!aiProvider) {
      throw new EmbeddingError('Failed to initialize AI provider');
    }

    // Use native batch support for multiple texts
    if (texts.length > 1) {
      try {
        // Process in batches
        const allEmbeddings: number[][] = [];

        for (let i = 0; i < texts.length; i += batchSize) {
          const batch = texts.slice(i, i + batchSize);

          const result = await withRetry(
            async () =>
              embedMany({
                model: aiProvider!.embedding(EMBEDDING_MODEL),
                values: batch,
              }),
            { retryableErrors: [EmbeddingError] }
          );

          let batchEmbeddings = result.embeddings;

          // Normalize if requested
          if (normalize) {
            batchEmbeddings = batchEmbeddings.map(e => normalizeVector(e));
          }

          allEmbeddings.push(...batchEmbeddings);
        }

        return allEmbeddings;
      } catch (err) {
        error('Batch embedding failed, falling back to sequential:', err);
        // Fall back to sequential processing
      }
    }

    // Fallback: process with concurrency
    const embeddings: number[][] = [];
    const concurrency = 5;

    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const batchPromises = batch.map(text =>
        generateEmbedding(text, normalize)
      );
      const batchResults = await Promise.all(batchPromises);
      embeddings.push(...batchResults);
    }

    return embeddings;
  } catch (err) {
    error('Error generating embeddings:', err);
    throw new EmbeddingError(
      `Failed to generate embeddings: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }
}

/**
 * Clear the embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  log('Embedding cache cleared');
}
