import { pipeline, env } from '@huggingface/transformers';
import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  PROVIDER_TYPE,
  EMBEDDING_MODEL,
  AI_BASE_URL,
  AI_API_KEY,
} from '../constants/providers';
import { log, error } from '../utils/logger';
import { normalizeVector } from '../utils/vectors';
import { withRetry, EmbeddingError } from '../utils/errors';

// Configure transformers to use local models
env.allowLocalModels = true;
env.useBrowserCache = false;

// Prevent reinitialization during HMR in development
if (typeof global !== 'undefined') {
  (global as any).__EMBEDDING_PIPELINE_CACHE =
    (global as any).__EMBEDDING_PIPELINE_CACHE || null;
  (global as any).__AI_PROVIDER_CACHE =
    (global as any).__AI_PROVIDER_CACHE || null;
}

type EmbeddingPipelineFunction = (
  text: string,
  options?: Record<string, unknown>
) => Promise<{ data: number[] }>;

// Transformers pipeline - narrowed assignment function
let embeddingPipeline: EmbeddingPipelineFunction | null = null;

async function initializePipeline(): Promise<void> {
  // Check global cache for HMR persistence
  if ((global as any).__EMBEDDING_PIPELINE_CACHE) {
    embeddingPipeline = (global as any).__EMBEDDING_PIPELINE_CACHE;
    return;
  }

  const pipe = await pipeline('feature-extraction', EMBEDDING_MODEL);
  embeddingPipeline = pipe as EmbeddingPipelineFunction;

  // Store in global cache for HMR
  (global as any).__EMBEDDING_PIPELINE_CACHE = embeddingPipeline;
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
  if (PROVIDER_TYPE === 'transformers') {
    // Check if already initialized or cached
    if (embeddingPipeline || (global as any).__EMBEDDING_PIPELINE_CACHE) {
      embeddingPipeline =
        embeddingPipeline || (global as any).__EMBEDDING_PIPELINE_CACHE;
      embeddingModelVersion = embeddingModelVersion || EMBEDDING_MODEL;
      return;
    }

    log(
      'Loading local embedding model (this may take a moment on first run)...'
    );
    log(`Model: ${EMBEDDING_MODEL}`);

    await initializePipeline();
    log('Local embedding model loaded successfully');
    embeddingModelVersion = EMBEDDING_MODEL;
  } else if (PROVIDER_TYPE === 'ai-sdk') {
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
    let embedding: number[];

    if (PROVIDER_TYPE === 'transformers') {
      if (!embeddingPipeline) {
        await initializeEmbeddings();
      }

      if (!embeddingPipeline) {
        throw new EmbeddingError('Failed to initialize embedding pipeline');
      }

      // Generate embedding with mean pooling
      const output = await embeddingPipeline(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the embedding array
      embedding = Array.from(output.data) as number[];
    } else if (PROVIDER_TYPE === 'ai-sdk') {
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

      embedding = result.embedding;
    } else {
      throw new EmbeddingError(`Unknown provider type: ${PROVIDER_TYPE}`);
    }

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
    // For AI SDK, use native batch support if available
    if (PROVIDER_TYPE === 'ai-sdk' && texts.length > 1) {
      if (!aiProvider) {
        await initializeEmbeddings();
      }

      if (!aiProvider) {
        throw new EmbeddingError('Failed to initialize AI provider');
      }

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

    // For transformers or fallback, process with concurrency
    const embeddings: number[][] = [];
    const concurrency = PROVIDER_TYPE === 'transformers' ? 1 : 5;

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
