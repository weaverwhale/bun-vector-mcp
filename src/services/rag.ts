import type { Database } from 'bun:sqlite';
import { searchSimilar } from './search';
import { generateAnswer, streamAnswer } from './llm';
import {
  DEFAULT_TOP_K,
  MAX_ANSWER_TOKENS,
  SIMILARITY_THRESHOLD,
  MAX_CONTEXT_LENGTH,
} from '../constants/rag';
import { log } from '../utils/logger';
import type { StreamEvent, SearchResult } from '../types/index';
import {
  validateQueryInput,
  validateTopK,
  validateSimilarityThreshold,
} from '../utils/errors';

export interface RAGResult {
  answer: string;
  sources: Array<{
    filename: string;
    chunk_text: string;
    similarity: number;
  }>;
  question: string;
}

/**
 * Build context from search results with source citations
 */
function buildContext(searchResults: SearchResult[]): {
  context: string;
  sources: SearchResult[];
} {
  const contextParts: string[] = [];
  let totalLength = 0;

  for (let i = 0; i < searchResults.length; i++) {
    const result = searchResults[i]!;
    let chunkText = result.chunk_text;
    const citation = `[Source ${i + 1}: ${result.filename}${result.chunk_index !== undefined ? `, chunk ${result.chunk_index + 1}` : ''}]`;

    // For the first chunk, always include it (truncate if necessary)
    if (i === 0) {
      const citationLength = `${citation}\n`.length;
      const partLength = citationLength + chunkText.length;

      if (partLength > MAX_CONTEXT_LENGTH) {
        // Truncate the first chunk to fit within the length limit
        const truncationMessage = '\n\n[... truncated for length ...]';
        const maxChunkLength =
          MAX_CONTEXT_LENGTH - citationLength - truncationMessage.length;

        chunkText = chunkText.substring(0, maxChunkLength) + truncationMessage;

        log(
          `[buildContext] Truncated first chunk from ${result.chunk_text.length} to ${maxChunkLength} chars`
        );
      }

      contextParts.push(`${citation}\n${chunkText}`);
      totalLength = citationLength + chunkText.length;
      continue;
    }

    // For subsequent chunks, check if adding them would exceed the limit
    if (totalLength + chunkText.length + citation.length > MAX_CONTEXT_LENGTH) {
      log(
        `[buildContext] Reached max context length at chunk ${i + 1} (${totalLength} chars)`
      );
      break;
    }

    // Add source citation for attribution
    contextParts.push(`${citation}\n${chunkText}`);
    totalLength += chunkText.length + citation.length;
  }

  const context = contextParts.join('\n\n---\n\n');

  log(
    `[buildContext] Built context with ${contextParts.length} chunks (${context.length} chars)`
  );

  return {
    context,
    sources: searchResults.slice(0, contextParts.length),
  };
}

/**
 * Ask a question and get an answer using RAG
 */
export async function askQuestion(
  db: Database,
  question: string,
  topK: number = DEFAULT_TOP_K,
  maxAnswerLength: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string,
  minSimilarity: number = SIMILARITY_THRESHOLD
): Promise<RAGResult> {
  const startTime = performance.now();

  // Validate inputs
  validateQueryInput(question);
  validateTopK(topK);
  validateSimilarityThreshold(minSimilarity);

  log(`[askQuestion] Question: "${question}"`);

  // Step 1: Search for relevant documents
  const searchResults = await searchSimilar(db, question, topK, minSimilarity);

  if (searchResults.length === 0) {
    log('[askQuestion] No relevant documents found');
    return {
      answer: "I don't have enough information to answer that question.",
      sources: [],
      question,
    };
  }

  log(`[askQuestion] Found ${searchResults.length} relevant documents`);

  // Step 2: Build context
  const { context, sources } = buildContext(searchResults);

  // Step 3: Generate answer using LLM
  const answer = await generateAnswer(
    question,
    context,
    maxAnswerLength,
    systemPrompt
  );

  const tookMs = Math.round((performance.now() - startTime) * 100) / 100;
  log(`[askQuestion] Completed in ${tookMs}ms`);

  return {
    answer,
    sources: sources.map(r => ({
      filename: r.filename,
      chunk_text: r.chunk_text,
      similarity: r.similarity,
    })),
    question,
  };
}

/**
 * Stream question answering with RAG
 */
export async function* streamQuestion(
  db: Database,
  question: string,
  topK: number = DEFAULT_TOP_K,
  maxAnswerLength: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string,
  minSimilarity: number = SIMILARITY_THRESHOLD
): AsyncGenerator<StreamEvent, void, undefined> {
  // Validate inputs
  validateQueryInput(question);
  validateTopK(topK);
  validateSimilarityThreshold(minSimilarity);

  const startTime = performance.now();

  try {
    // Step 1: Search for relevant documents
    const searchResults = await searchSimilar(
      db,
      question,
      topK,
      minSimilarity
    );

    if (searchResults.length === 0) {
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

    // Step 2: Build context
    const { context, sources } = buildContext(searchResults);

    // Step 3: Emit sources
    yield {
      type: 'sources',
      sources: sources.map(r => ({
        id: r.id,
        filename: r.filename,
        chunk_text: r.chunk_text,
        similarity: r.similarity,
      })),
    };

    // Step 4: Stream answer using LLM
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
    yield { type: 'done', took_ms };
  } catch (err) {
    log(`[streamQuestion] Error: ${err}`);
    yield {
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
