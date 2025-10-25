import type { Database } from 'bun:sqlite';
import { searchSimilar } from './search.ts';
import { generateAnswer } from './llm.ts';
import { DEFAULT_TOP_K, MAX_ANSWER_TOKENS } from '../constants/rag.ts';
import { log } from '../utils/logger.ts';

export interface RAGResult {
  answer: string;
  sources: Array<{
    filename: string;
    chunk_text: string;
    similarity: number;
  }>;
  question: string;
}

export async function askQuestion(
  db: Database,
  question: string,
  topK: number = DEFAULT_TOP_K,
  maxAnswerLength: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string
): Promise<RAGResult> {
  log(`[askQuestion] Question: "${question}"`);
  log(
    `[askQuestion] Parameters: topK=${topK}, maxAnswerLength=${maxAnswerLength}${systemPrompt ? ', customSystemPrompt=true' : ''}`
  );

  // Step 1: Search for relevant documents
  log('[askQuestion] Step 1: Searching for relevant documents...');
  const searchResults = await searchSimilar(db, question, topK);

  if (searchResults.length === 0) {
    log('[askQuestion] No relevant documents found');
    return {
      answer: "I don't have enough information to answer that question.",
      sources: [],
      question,
    };
  }

  log(`[askQuestion] Found ${searchResults.length} relevant documents`);

  // Step 2: Combine relevant chunks into context
  log('[askQuestion] Step 2: Building context from search results...');
  const context = searchResults
    .map((result, idx) => `[${idx + 1}] ${result.chunk_text}`)
    .join('\n\n');

  log(`[askQuestion] Context length: ${context.length} characters`);

  // Step 3: Generate answer using LLM
  log('[askQuestion] Step 3: Generating answer with LLM...');
  const answer = await generateAnswer(
    question,
    context,
    maxAnswerLength,
    systemPrompt
  );

  log(`[askQuestion] Generated answer: ${answer.length} characters`);

  // Step 4: Return answer with sources
  return {
    answer,
    sources: searchResults.map(r => ({
      filename: r.filename,
      chunk_text: r.chunk_text,
      similarity: r.similarity,
    })),
    question,
  };
}
