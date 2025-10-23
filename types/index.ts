export interface Document {
  id: number;
  filename: string;
  content: string;
  chunk_text: string;
  embedding: number[];
  created_at: number;
}

export interface SearchRequest {
  query: string;
  topK?: number;
}

export interface SearchResult {
  id: number;
  filename: string;
  chunk_text: string;
  similarity: number;
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

