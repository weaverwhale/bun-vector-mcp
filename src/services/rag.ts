import type { Database } from 'bun:sqlite';
import { searchSimilar } from './search';
import { generateAnswer, streamAnswer } from './llm';
import { getAdjacentChunks } from '../db/schema';
import {
  DEFAULT_TOP_K,
  MAX_ANSWER_TOKENS,
  SIMILARITY_THRESHOLD,
  MAX_CONTEXT_LENGTH,
  ENABLE_MMR,
  ENABLE_ADJACENT_CHUNKS,
  MMR_DIVERSITY_LAMBDA,
} from '../constants/rag';
import { log } from '../utils/logger';
import { cosineSimilarity } from '../utils/vectors';
import {
  validateAnswerFaithfulness,
  calculateAnswerConfidence,
  detectHallucinations,
  logQueryMetrics,
} from './evaluation';
import type { StreamEvent, SearchResult } from '../types/index';

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
 * Build smart context using MMR for diversity and adjacent chunks for completeness
 */
async function buildSmartContext(
  db: Database,
  searchResults: SearchResult[]
): Promise<{ context: string; enhancedSources: SearchResult[] }> {
  log('[buildSmartContext] Building context with MMR and adjacent chunks');

  let selectedResults = searchResults;

  // Apply MMR for diversity if enabled
  if (ENABLE_MMR && searchResults.length > 1) {
    log('[buildSmartContext] Applying MMR for result diversity');
    selectedResults = applyMMR(searchResults);
  }

  // Expand with adjacent chunks if enabled
  let finalResults = selectedResults;
  if (ENABLE_ADJACENT_CHUNKS) {
    log('[buildSmartContext] Expanding with adjacent chunks');
    finalResults = await expandWithAdjacentChunks(db, selectedResults);
  }

  // Deduplicate overlapping content
  finalResults = deduplicateContext(finalResults);

  // Build context string with length constraint
  const contextParts: string[] = [];
  let totalLength = 0;

  for (let i = 0; i < finalResults.length; i++) {
    const result = finalResults[i]!;
    const chunkText = result.chunk_text;

    if (totalLength + chunkText.length > MAX_CONTEXT_LENGTH) {
      log(`[buildSmartContext] Reached max context length at chunk ${i + 1}`);
      break;
    }

    contextParts.push(`[${i + 1}] ${chunkText}`);
    totalLength += chunkText.length;
  }

  const context = contextParts.join('\n\n');
  log(
    `[buildSmartContext] Built context with ${contextParts.length} chunks (${context.length} chars)`
  );

  return {
    context,
    enhancedSources: finalResults.slice(0, contextParts.length),
  };
}

/**
 * Apply Maximal Marginal Relevance for diversity
 */
function applyMMR(results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) return results;

  const lambda = MMR_DIVERSITY_LAMBDA;
  const selected: SearchResult[] = [];
  const remaining = [...results];

  // Always select the top result first
  selected.push(remaining.shift()!);

  while (remaining.length > 0 && selected.length < DEFAULT_TOP_K) {
    let maxScore = -Infinity;
    let maxIdx = 0;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;

      // Calculate diversity (1 - max similarity to selected)
      let maxSimilarity = 0;
      for (const sel of selected) {
        // Use text-based similarity for diversity (more efficient)
        const textSim = calculateJaccardSimilarity(
          candidate.chunk_text,
          sel.chunk_text
        );
        maxSimilarity = Math.max(maxSimilarity, textSim);
      }

      const diversity = 1 - maxSimilarity;

      // MMR score: lambda * relevance + (1-lambda) * diversity
      const mmrScore = lambda * candidate.similarity + (1 - lambda) * diversity;

      if (mmrScore > maxScore) {
        maxScore = mmrScore;
        maxIdx = i;
      }
    }

    selected.push(remaining.splice(maxIdx, 1)[0]!);
  }

  log(`[applyMMR] Selected ${selected.length} diverse results`);
  return selected;
}

/**
 * Expand results with adjacent chunks for better context
 */
async function expandWithAdjacentChunks(
  db: Database,
  results: SearchResult[]
): Promise<SearchResult[]> {
  const expanded: SearchResult[] = [];
  const seenIds = new Set<number>();

  for (const result of results) {
    if (!result.chunk_index) {
      expanded.push(result);
      seenIds.add(result.id);
      continue;
    }

    // Get adjacent chunks (1 before, 1 after)
    const adjacent = getAdjacentChunks(
      db,
      result.filename,
      result.chunk_index,
      1,
      1
    );

    for (const chunk of adjacent) {
      if (!seenIds.has(chunk.id)) {
        expanded.push({
          id: chunk.id,
          filename: chunk.filename,
          chunk_text: chunk.chunk_text,
          chunk_index: chunk.chunk_index,
          similarity:
            chunk.id === result.id
              ? result.similarity
              : result.similarity * 0.9,
        });
        seenIds.add(chunk.id);
      }
    }
  }

  // Sort by chunk_index within same file, then by similarity
  expanded.sort((a, b) => {
    if (
      a.filename === b.filename &&
      a.chunk_index !== undefined &&
      b.chunk_index !== undefined
    ) {
      return a.chunk_index - b.chunk_index;
    }
    return b.similarity - a.similarity;
  });

  log(
    `[expandWithAdjacentChunks] Expanded from ${results.length} to ${expanded.length} chunks`
  );
  return expanded;
}

/**
 * Remove overlapping content between chunks
 */
function deduplicateContext(results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) return results;

  const deduplicated: SearchResult[] = [results[0]!];

  for (let i = 1; i < results.length; i++) {
    const current = results[i]!;
    const previous = deduplicated[deduplicated.length - 1]!;

    // Check for high text overlap with previous chunk
    const similarity = calculateJaccardSimilarity(
      current.chunk_text,
      previous.chunk_text
    );

    if (similarity < 0.7) {
      // Not too similar, include it
      deduplicated.push(current);
    } else {
      log(
        `[deduplicateContext] Skipped duplicate chunk ${current.id} (similarity: ${similarity.toFixed(2)})`
      );
    }
  }

  return deduplicated;
}

/**
 * Calculate Jaccard similarity between two texts
 */
function calculateJaccardSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(
    text1
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );

  const tokens2 = new Set(
    text2
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );

  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
}

export async function askQuestion(
  db: Database,
  question: string,
  topK: number = DEFAULT_TOP_K,
  maxAnswerLength: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string,
  minSimilarity: number = SIMILARITY_THRESHOLD
): Promise<RAGResult> {
  log(`[askQuestion] Question: "${question}"`);
  log(
    `[askQuestion] Parameters: topK=${topK}, maxAnswerLength=${maxAnswerLength}, minSimilarity=${minSimilarity}${systemPrompt ? ', customSystemPrompt=true' : ''}`
  );

  // Step 1: Search for relevant documents
  log('[askQuestion] Step 1: Searching for relevant documents...');
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

  // Step 2: Build smart context with MMR and adjacent chunks
  log('[askQuestion] Step 2: Building smart context...');
  const { context, enhancedSources } = await buildSmartContext(
    db,
    searchResults
  );

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

  // Step 4: Validate answer quality
  const faithfulness = validateAnswerFaithfulness(answer, context);
  const confidence = calculateAnswerConfidence(enhancedSources);
  const hallucination = detectHallucinations(answer, enhancedSources);

  if (!faithfulness.faithful) {
    log(
      `[askQuestion] Warning: Low faithfulness score (${faithfulness.confidence.toFixed(2)})`
    );
    log(`[askQuestion] Issues: ${faithfulness.issues.join('; ')}`);
  }

  if (hallucination.hasHallucination) {
    log(
      `[askQuestion] Warning: Potential hallucinations detected: ${hallucination.suspiciousPhrases.join(', ')}`
    );
  }

  log(`[askQuestion] Answer confidence: ${confidence.toFixed(2)}`);

  // Step 5: Return answer with enhanced sources
  return {
    answer,
    sources: enhancedSources.map(r => ({
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
  systemPrompt?: string,
  minSimilarity: number = SIMILARITY_THRESHOLD
): AsyncGenerator<StreamEvent, void, undefined> {
  const startTime = performance.now();

  log(`[streamQuestion] Question: "${question}"`);
  log(
    `[streamQuestion] Parameters: topK=${topK}, maxAnswerLength=${maxAnswerLength}, minSimilarity=${minSimilarity}${systemPrompt ? ', customSystemPrompt=true' : ''}`
  );

  try {
    // Step 1: Search for relevant documents
    log('[streamQuestion] Step 1: Searching for relevant documents...');
    const searchResults = await searchSimilar(
      db,
      question,
      topK,
      minSimilarity
    );

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

    // Step 2: Build smart context
    log('[streamQuestion] Step 2: Building smart context...');
    const { context, enhancedSources } = await buildSmartContext(
      db,
      searchResults
    );

    log(`[streamQuestion] Context length: ${context.length} characters`);

    // Step 3: Emit sources
    yield {
      type: 'sources',
      sources: enhancedSources.map(r => ({
        id: r.id,
        filename: r.filename,
        chunk_text: r.chunk_text,
        similarity: r.similarity,
      })),
    };

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
