// Chunking
export const CHUNK_SIZE = 1800;
export const CHUNK_OVERLAP = 400;
export const MIN_CHUNK_SIZE = 50;

// Question Generation (for Hypothetical Question Embedding)
export const QUESTIONS_PER_CHUNK = 5;

// Retrieval
export const DEFAULT_TOP_K = 8;
export const SIMILARITY_THRESHOLD = 0.3;

// Hybrid Search Weights
export const QUESTION_WEIGHT = 0.5;
export const CONTENT_WEIGHT = 0.5;

// Context Assembly
export const MAX_CONTEXT_LENGTH = 12000;

// Generation
export const MAX_ANSWER_TOKENS = 5000;
export const GENERATION_TEMPERATURE = 0.3;
