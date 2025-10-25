import type { Database } from 'bun:sqlite';
import { searchSimilar } from './search';
import { generateAnswer, streamAnswer } from './llm';
import { DEFAULT_TOP_K, MAX_ANSWER_TOKENS } from '../constants/rag';
import { log } from '../utils/logger';
import type { StreamEvent } from '../types/index';

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

/**
 * Stream question answering with RAG
 * Yields StreamEvents progressively: sources, then text chunks, then done
 */
export async function* streamQuestion(
  db: Database,
  question: string,
  topK: number = DEFAULT_TOP_K,
  maxAnswerLength: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string
): AsyncGenerator<StreamEvent, void, undefined> {
  const startTime = performance.now();

  log(`[streamQuestion] Question: "${question}"`);
  log(
    `[streamQuestion] Parameters: topK=${topK}, maxAnswerLength=${maxAnswerLength}${systemPrompt ? ', customSystemPrompt=true' : ''}`
  );

  try {
    // Step 1: Search for relevant documents
    log('[streamQuestion] Step 1: Searching for relevant documents...');
    const searchResults = await searchSimilar(db, question, topK);

    if (searchResults.length === 0) {
      log('[streamQuestion] No relevant documents found');
      yield {
        type: 'chunk',
        text: "I don't have enough information to answer that question.",
      };
      yield {
        type: 'done',
        took_ms: Math.round((performance.now() - startTime) * 100) / 100,
      };
      return;
    }

    log(`[streamQuestion] Found ${searchResults.length} relevant documents`);

    // Step 2: Emit sources first
    yield {
      type: 'sources',
      sources: searchResults.map(r => ({
        id: r.id,
        filename: r.filename,
        chunk_text: r.chunk_text,
        similarity: r.similarity,
      })),
    };

    // Step 3: Build context
    log('[streamQuestion] Step 2: Building context from search results...');
    const context = searchResults
      .map((result, idx) => `[${idx + 1}] ${result.chunk_text}`)
      .join('\n\n');

    log(`[streamQuestion] Context length: ${context.length} characters`);

    // Step 4: Stream answer using LLM
    log('[streamQuestion] Step 3: Streaming answer with LLM...');
    for await (const chunk of streamAnswer(
      question,
      context,
      maxAnswerLength,
      systemPrompt
    )) {
      yield { type: 'chunk', text: chunk };
    }

    // Step 5: Emit done event
    const took_ms = Math.round((performance.now() - startTime) * 100) / 100;
    log(`[streamQuestion] Completed in ${took_ms}ms`);
    yield { type: 'done', took_ms };
  } catch (err) {
    log(`[streamQuestion] Error: ${err}`);
    yield {
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
