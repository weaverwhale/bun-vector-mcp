import type { Database } from "bun:sqlite";
import { getAllDocuments } from "../db/schema.ts";
import { generateEmbedding } from "./embeddings.ts";
import type { SearchResult } from "../types/index.ts";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    magnitudeA += a[i]! * a[i]!;
    magnitudeB += b[i]! * b[i]!;
  }
  
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
}

export async function searchSimilar(
  db: Database,
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  
  // Get all documents from database
  const documents = getAllDocuments(db);
  
  if (documents.length === 0) {
    return [];
  }
  
  // Calculate similarity for each document
  const results = documents.map(doc => ({
    id: doc.id,
    filename: doc.filename,
    chunk_text: doc.chunk_text,
    similarity: cosineSimilarity(queryEmbedding, doc.embedding)
  }));
  
  // Sort by similarity (descending) and take top K
  results.sort((a, b) => b.similarity - a.similarity);
  
  return results.slice(0, topK);
}

