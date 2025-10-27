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

// Reranking
export const ENABLE_RERANKING = true;
export const RERANK_TOP_K = 8;

// Deduplication
export const DEDUPLICATION_THRESHOLD = 0.95; // Cosine similarity threshold for duplicates
export const ENABLE_DEDUPLICATION = true;

// Query Expansion
export const ENABLE_QUERY_EXPANSION = true;
export const QUERY_EXPANSION_COUNT = 2; // Generate 2 additional query variations

// Context Assembly
export const MAX_CONTEXT_LENGTH = 12000;
export const MMR_DIVERSITY_LAMBDA = 0.5; // 0 = max diversity, 1 = max relevance
export const ENABLE_MMR = true;
export const ENABLE_ADJACENT_CHUNKS = true; // Include chunks before/after for context

// Generation
export const MAX_ANSWER_TOKENS = 5000;
export const GENERATION_TEMPERATURE = 0.3;

// Evaluation & Monitoring
export const LOG_SEARCH_METRICS = true;
export const MIN_CONFIDENCE_THRESHOLD = 0.4;
