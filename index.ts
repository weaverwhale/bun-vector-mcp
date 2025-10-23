import { initializeDatabase, getDatabase, getDocumentCount } from "./db/schema.ts";
import { initializeEmbeddings } from "./services/embeddings.ts";
import { searchSimilar } from "./services/search.ts";
import type { SearchRequest, SearchResponse } from "./types/index.ts";

// Initialize on startup
console.log("Initializing vector database...");
const db = initializeDatabase();
await initializeEmbeddings();
console.log("Ready!\n");

const server = Bun.serve({
  port: 1738,
  routes: {
    "/": {
      GET: () => {
        const count = getDocumentCount(db);
        return new Response(
          JSON.stringify({
            status: "ok",
            message: "Vector Database API",
            documents: count,
            endpoints: {
              search: "POST /search",
              health: "GET /health"
            }
          }),
          {
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    },
    "/health": {
      GET: () => {
        const count = getDocumentCount(db);
        return new Response(
          JSON.stringify({
            status: "healthy",
            documents: count,
            timestamp: new Date().toISOString()
          }),
          {
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    },
    "/search": {
      POST: async (req) => {
        try {
          const body = await req.json() as SearchRequest;
          
          if (!body.query || typeof body.query !== "string") {
            return new Response(
              JSON.stringify({ error: "Missing or invalid 'query' parameter" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" }
              }
            );
          }
          
          const topK = body.topK && typeof body.topK === "number" ? body.topK : 5;
          
          const startTime = performance.now();
          const results = await searchSimilar(db, body.query, topK);
          const endTime = performance.now();
          
          const response: SearchResponse = {
            results,
            query: body.query,
            took_ms: Math.round((endTime - startTime) * 100) / 100
          };
          
          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          console.error("Search error:", error);
          return new Response(
            JSON.stringify({
              error: "Internal server error",
              message: error instanceof Error ? error.message : String(error)
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
      }
    }
  },
  development: {
    hmr: false
  }
});

console.log(`🚀 Vector Database API running on http://localhost:${server.port}`);
console.log(`📊 Currently storing ${getDocumentCount(db)} document chunks`);
console.log("\nEndpoints:");
console.log("  GET  / - API information");
console.log("  GET  /health - Health check");
console.log("  POST /search - Search similar documents");
console.log("\nExample search:");
console.log(`  curl -X POST http://localhost:${server.port}/search \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"query": "your search query", "topK": 5}'`);
