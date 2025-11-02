// Chunking
export const CHUNK_SIZE = 1200;
export const CHUNK_OVERLAP = 400;
export const MIN_CHUNK_SIZE = 50;
export const USE_SEMANTIC_CHUNKING = true;

// Question Generation (for Hypothetical Question Embedding)
export const QUESTIONS_PER_CHUNK = 5;

// Retrieval
export const DEFAULT_TOP_K = 5;
export const SIMILARITY_THRESHOLD = 0.6;

// Hybrid Search Weights
export const QUESTION_WEIGHT = 0.6;
export const CONTENT_WEIGHT = 0.4;

// Context Assembly
export const MAX_CONTEXT_LENGTH = CHUNK_SIZE * 40;

// Generation
export const MAX_ANSWER_TOKENS = CHUNK_SIZE * 5;
export const GENERATION_TEMPERATURE = 0.3;
