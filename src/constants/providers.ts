// AI SDK Models
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ||
  'text-embedding-nomic-embed-text-v1.5-embedding';
export const EMBEDDING_DIMENSIONS = 768; // nomic-embed-text produces 768-dim embeddings
export const LLM_MODEL = process.env.LLM_MODEL || 'qwen3-1.7b';

// AI SDK Configuration (LMStudio/OpenAI/etc)
export const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
export const AI_BASE_URL =
  process.env.AI_BASE_URL || 'http://localhost:1234/v1';
export const AI_API_KEY = process.env.AI_API_KEY || 'lm-studio';
