import { pipeline, env } from '@huggingface/transformers';
import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  PROVIDER_TYPE,
  EMBEDDING_MODEL,
  AI_BASE_URL,
  AI_API_KEY,
} from '../constants/providers';
import { log, error } from '../utils/logger';

// Configure transformers to use local models
env.allowLocalModels = true;
env.useBrowserCache = false;

type EmbeddingPipelineFunction = (
  text: string,
  options?: Record<string, unknown>
) => Promise<{ data: number[] }>;

// Transformers pipeline - narrowed assignment function
let embeddingPipeline: EmbeddingPipelineFunction | null = null;

async function initializePipeline(): Promise<void> {
  const pipe = await pipeline('feature-extraction', EMBEDDING_MODEL);
  embeddingPipeline = pipe as EmbeddingPipelineFunction;
}

// AI SDK provider
let aiProvider: ReturnType<typeof createOpenAI> | null = null;

export async function initializeEmbeddings(): Promise<void> {
  if (PROVIDER_TYPE === 'transformers') {
    if (embeddingPipeline) {
      return;
    }

    log(
      'Loading local embedding model (this may take a moment on first run)...'
    );
    log(`Model: ${EMBEDDING_MODEL}`);

    await initializePipeline();
    log('Local embedding model loaded successfully');
  } else if (PROVIDER_TYPE === 'ai-sdk') {
    if (aiProvider) {
      return;
    }

    log('Using AI SDK with embeddings model:', EMBEDDING_MODEL);
    log('Base URL:', AI_BASE_URL);

    aiProvider = createOpenAI({
      baseURL: AI_BASE_URL,
      apiKey: AI_API_KEY,
    });
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (PROVIDER_TYPE === 'transformers') {
    if (!embeddingPipeline) {
      await initializeEmbeddings();
    }

    if (!embeddingPipeline) {
      throw new Error('Failed to initialize embedding pipeline');
    }

    // Generate embedding with mean pooling
    const output = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Extract the embedding array
    const embedding = Array.from(output.data) as number[];

    return embedding;
  } else if (PROVIDER_TYPE === 'ai-sdk') {
    if (!aiProvider) {
      await initializeEmbeddings();
    }

    if (!aiProvider) {
      throw new Error('Failed to initialize AI provider');
    }

    try {
      const { embedding } = await embed({
        model: aiProvider.embedding(EMBEDDING_MODEL),
        value: text,
      });

      return embedding;
    } catch (err) {
      error('Error generating embedding:', err);
      throw new Error(`Failed to generate embedding: ${err}`);
    }
  } else {
    throw new Error(`Unknown provider type: ${PROVIDER_TYPE}`);
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
  }

  return embeddings;
}
