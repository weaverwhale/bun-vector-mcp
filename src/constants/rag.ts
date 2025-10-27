// Chunking
export const CHUNK_SIZE = 1800;
export const CHUNK_OVERLAP = 400;
export const MIN_CHUNK_SIZE = 50;

// Question Generation (for Hypothetical Question Embedding)
export const QUESTIONS_PER_CHUNK = 5;

// Retrieval - Two-stage approach
export const INITIAL_RETRIEVAL_K = 20; // First stage: retrieve more candidates
export const DEFAULT_TOP_K = 8; // Second stage: after reranking
export const SIMILARITY_THRESHOLD = 0.2; // Lower threshold, rely on reranking

// Hybrid Search Weights
export const QUESTION_WEIGHT = 0.6; // Weight for question embeddings
export const CONTENT_WEIGHT = 0.4; // Weight for content embeddings

// Context Assembly
export const MAX_CONTEXT_LENGTH = 12000;

// Generation
export const MAX_ANSWER_TOKENS = 5000;
export const GENERATION_TEMPERATURE = 0.3;
