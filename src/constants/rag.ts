// Chunking
export const CHUNK_SIZE = 1400;
export const CHUNK_OVERLAP = 400;

// Question Generation (for Hypothetical Question Embedding)
export const QUESTIONS_PER_CHUNK = 4;

// Retrieval
export const DEFAULT_TOP_K = 8;
export const SIMILARITY_THRESHOLD = 0.3;

// Hybrid Search Weights
export const QUESTION_WEIGHT = 0.7; // Weight for question embeddings
export const CONTENT_WEIGHT = 0.3; // Weight for content embeddings

// Generation
export const MAX_ANSWER_TOKENS = 1200;
export const GENERATION_TEMPERATURE = 0.3;
