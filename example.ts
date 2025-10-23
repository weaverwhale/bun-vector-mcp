import type { SearchResponse, SearchResult } from "./types/index.ts";

/**
 * Example usage of the Vector Database API
 * 
 * This script demonstrates how to use the search endpoint programmatically.
 * Make sure the server is running: bun start
 */

const API_URL = "http://localhost:1738";

async function search(query: string, topK: number = 5) {
  const response = await fetch(`${API_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, topK }),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  return await response.json();
}

async function main() {
  console.log("🔍 Vector Database Search Example\n");

  try {
    // Example queries
    const queries = [
      "What are embeddings?",
      "How do vector databases work?",
      "Tell me about similarity search",
    ];

    for (const query of queries) {
      console.log(`Query: "${query}"`);
      const results = await search(query, 2) as SearchResponse;

      console.log(`Found ${results.results.length} results in ${results.took_ms}ms:\n`);

      results.results.forEach((result: SearchResult, index: number) => {
        console.log(`  ${index + 1}. [${result.filename}] (similarity: ${result.similarity.toFixed(3)})`);
        console.log(`     "${result.chunk_text.substring(0, 100)}..."\n`);
      });

      console.log("---\n");
    }
  } catch (error) {
    console.error("Error:", error);
    console.log("\n⚠️  Make sure the server is running: bun start");
  }
}

main();

