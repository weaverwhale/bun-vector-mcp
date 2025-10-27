export interface Document {
  id: number;
  filename: string;
  content: string;
  chunk_text: string;
  embedding: number[];
  chunk_index: number;
  chunk_size: number;
  created_at: number;
  hypothetical_questions?: string[];
  question_embeddings?: number[][];
  chunk_metadata?: Record<string, any>;
}

export interface SearchRequest {
  query: string;
  topK?: number;
  similarityThreshold?: number;
}

export interface SearchResult {
  id: number;
  filename: string;
  chunk_text: string;
  similarity: number;
  chunk_index?: number;
  rerank_score?: number;
}

export interface SearchMetrics {
  query: string;
  total_documents: number;
  initial_results: number;
  after_deduplication: number;
  final_results: number;
  avg_similarity: number;
  took_ms: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  took_ms: number;
}

export interface IngestResult {
  filename: string;
  chunks_created: number;
  success: boolean;
  error?: string;
}

export interface AskRequest {
  question: string;
  topK?: number;
  similarityThreshold?: number;
  maxAnswerLength?: number;
  systemPrompt?: string;
}

export interface AskResponse {
  answer: string;
  sources: Array<{
    filename: string;
    chunk_text: string;
    similarity: number;
  }>;
  question: string;
  took_ms: number;
}

// Streaming types
export type StreamEvent =
  | { type: 'sources'; sources: SearchResult[] }
  | { type: 'chunk'; text: string }
  | { type: 'done'; took_ms: number }
  | { type: 'error'; error: string };

export interface AskStreamRequest extends AskRequest {
  stream?: boolean;
}

// Frontend types
export type QueryMode = 'ask' | 'search';

export interface Source {
  filename: string;
  chunk_text?: string;
  similarity: number;
}
