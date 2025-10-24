// Provider Selection: 'transformers' (local) or 'ai-sdk' (LMStudio/OpenAI/etc)
export const PROVIDER_TYPE = (process.env.PROVIDER_TYPE || 'transformers') as
  | 'transformers'
  | 'ai-sdk';

//Transformers Models (Local, No Server)
export const TRANSFORMERS_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const TRANSFORMERS_LLM_MODEL = 'Xenova/Phi-3-mini-4k-instruct';

// AI SDK Configuration (LMStudio/OpenAI/etc)
export const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai') as 'openai';
export const AI_BASE_URL =
  process.env.AI_BASE_URL || 'http://localhost:1234/v1';
export const AI_API_KEY = process.env.AI_API_KEY || 'lm-studio';

// AI SDK Models
export const AI_SDK_EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ||
  'text-embedding-nomic-embed-text-v1.5-embedding';
export const AI_SDK_LLM_MODEL = process.env.LLM_MODEL || 'qwen3-1.7b';

// Active model selection (based on provider type)
export const EMBEDDING_MODEL =
  PROVIDER_TYPE === 'transformers'
    ? TRANSFORMERS_EMBEDDING_MODEL
    : AI_SDK_EMBEDDING_MODEL;

export const LLM_MODEL =
  PROVIDER_TYPE === 'transformers' ? TRANSFORMERS_LLM_MODEL : AI_SDK_LLM_MODEL;

// Chunking
export const CHUNK_SIZE = 1200;
export const CHUNK_OVERLAP = 200;

// Retrieval
export const DEFAULT_TOP_K = 8;
export const SIMILARITY_THRESHOLD = 0.3;

// Generation
export const MAX_ANSWER_TOKENS = 800;
export const GENERATION_TEMPERATURE = 0.3;

// System prompt
export const DEFAULT_SYSTEM_PROMPT = `You are an expert strength and conditioning coach.
You have a deep knowledge of training methodologies, exercise science, and athletic performance. 
Your task is to answer questions based ONLY on the information provided in the Context below. 
Follow these guidelines:
1. Be thorough and comprehensive - use ALL relevant information from the context
2. Provide complete explanations with specific details, methods, and principles
3. If the context mentions specific training systems, methods, or terminology, explain them fully
4. Structure your answer logically with clear explanations
5. If the context provides examples, protocols, or guidelines, include them
6. If the context does not contain enough information to fully answer the question, clearly state what information is missing
7. DO NOT make up information or draw from knowledge outside the provided context
Context sections are numbered [1], [2], etc. Use information from all relevant sections.
/no_think`;
