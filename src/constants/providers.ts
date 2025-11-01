//Transformers Models (Local, No Server)
export const TRANSFORMERS_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const TRANSFORMERS_EMBEDDING_DIMENSIONS = 384; // all-MiniLM-L6-v2 produces 384-dim embeddings
export const TRANSFORMERS_LLM_MODEL = 'Xenova/Phi-3-mini-4k-instruct';

// AI SDK Models
export const AI_SDK_EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ||
  'text-embedding-nomic-embed-text-v1.5-embedding';
export const AI_SDK_EMBEDDING_DIMENSIONS = 768; // nomic-embed-text produces 768-dim embeddings
export const AI_SDK_LLM_MODEL = process.env.LLM_MODEL || 'qwen3-1.7b';

// Provider Selection: 'transformers' (local) or 'ai-sdk' (LMStudio/OpenAI/etc)
export const PROVIDER_TYPE = (process.env.PROVIDER_TYPE || 'transformers') as
  | 'transformers'
  | 'ai-sdk';

// AI SDK Configuration (LMStudio/OpenAI/etc)
export const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai') as 'openai';
export const AI_BASE_URL =
  process.env.AI_BASE_URL || 'http://localhost:1234/v1';
export const AI_API_KEY = process.env.AI_API_KEY || 'lm-studio';

// Active model selection (based on provider type)
export const EMBEDDING_MODEL =
  PROVIDER_TYPE === 'transformers'
    ? TRANSFORMERS_EMBEDDING_MODEL
    : AI_SDK_EMBEDDING_MODEL;

export const EMBEDDING_DIMENSIONS =
  PROVIDER_TYPE === 'transformers'
    ? TRANSFORMERS_EMBEDDING_DIMENSIONS
    : AI_SDK_EMBEDDING_DIMENSIONS;

export const LLM_MODEL =
  PROVIDER_TYPE === 'transformers' ? TRANSFORMERS_LLM_MODEL : AI_SDK_LLM_MODEL;
