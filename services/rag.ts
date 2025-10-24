import type { Database } from "bun:sqlite";
import { searchSimilar } from "./search.ts";
import { generateAnswer } from "./llm.ts";
import { DEFAULT_TOP_K, MAX_ANSWER_TOKENS } from "../constants.ts";

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
  // Step 1: Search for relevant documents
  const searchResults = await searchSimilar(db, question, topK);
  
  if (searchResults.length === 0) {
    return {
      answer: "I don't have enough information to answer that question.",
      sources: [],
      question,
    };
  }
  
  // Step 2: Combine relevant chunks into context
  const context = searchResults
    .map((result, idx) => `[${idx + 1}] ${result.chunk_text}`)
    .join("\n\n");
  
  // Step 3: Generate answer using LLM
  const answer = await generateAnswer(question, context, maxAnswerLength, systemPrompt);
  
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

