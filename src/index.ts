import { initializeDatabase, getDocumentCount } from './db/schema.ts';
import { initializeEmbeddings } from './services/embeddings.ts';
import { initializeLLM } from './services/llm.ts';
import { searchSimilar } from './services/search.ts';
import { askQuestion } from './services/rag.ts';
import type {
  SearchRequest,
  SearchResponse,
  AskRequest,
  AskResponse,
} from './types/index.ts';
import indexHtml from './index.html';

// Initialize on startup
const db = initializeDatabase();
await initializeEmbeddings();
await initializeLLM();

const server = Bun.serve({
  port: 1738,
  idleTimeout: 120,
  routes: {
    '/': {
      GET: () => {
        const count = getDocumentCount(db);
        return new Response(
          JSON.stringify({
            status: 'ok',
            message: 'Vector Database API',
            documents: count,
            endpoints: {
              search: 'POST /search',
              ask: 'POST /ask',
              health: 'GET /health',
              ui: 'GET /ui',
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    },
    '/ui': indexHtml,
    '/health': {
      GET: () => {
        const count = getDocumentCount(db);
        return new Response(
          JSON.stringify({
            status: 'healthy',
            documents: count,
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    },
    '/search': {
      POST: async req => {
        try {
          const body = (await req.json()) as SearchRequest;

          if (!body.query || typeof body.query !== 'string') {
            return new Response(
              JSON.stringify({ error: "Missing or invalid 'query' parameter" }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }

          const topK =
            body.topK && typeof body.topK === 'number' ? body.topK : 5;

          const startTime = performance.now();
          const results = await searchSimilar(db, body.query, topK);
          const endTime = performance.now();

          const response: SearchResponse = {
            results,
            query: body.query,
            took_ms: Math.round((endTime - startTime) * 100) / 100,
          };

          return new Response(JSON.stringify(response), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Search error:', error);
          return new Response(
            JSON.stringify({
              error: 'Internal server error',
              message: error instanceof Error ? error.message : String(error),
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      },
    },
    '/ask': {
      POST: async req => {
        try {
          const body = (await req.json()) as AskRequest;

          if (!body.question || typeof body.question !== 'string') {
            return new Response(
              JSON.stringify({
                error: "Missing or invalid 'question' parameter",
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }

          const topK =
            body.topK && typeof body.topK === 'number' ? body.topK : 8;
          const maxAnswerLength =
            body.maxAnswerLength && typeof body.maxAnswerLength === 'number'
              ? body.maxAnswerLength
              : 800;
          const systemPrompt =
            body.systemPrompt && typeof body.systemPrompt === 'string'
              ? body.systemPrompt
              : undefined;

          const startTime = performance.now();
          const result = await askQuestion(
            db,
            body.question,
            topK,
            maxAnswerLength,
            systemPrompt
          );
          const endTime = performance.now();

          const response: AskResponse = {
            ...result,
            took_ms: Math.round((endTime - startTime) * 100) / 100,
          };

          return new Response(JSON.stringify(response), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Ask error:', error);
          return new Response(
            JSON.stringify({
              error: 'Internal server error',
              message: error instanceof Error ? error.message : String(error),
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      },
    },
  },
  development: {
    hmr: false,
  },
});

console.log(
  `🚀 Vector Database API running on http://localhost:${server.port}`
);
console.log(`📊 Currently storing ${getDocumentCount(db)} document chunks`);
console.log('\nEndpoints:');
console.log('  GET  / - API information');
console.log('  GET  /ui - Web UI for asking questions');
console.log('  GET  /health - Health check');
console.log('  POST /search - Search similar documents');
console.log('  POST /ask - Ask a question (RAG)');
console.log('\nExample search:');
console.log(`  curl -X POST http://localhost:${server.port}/search \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"query": "your search query", "topK": 5}'`);
console.log('\nExample ask:');
console.log(`  curl -X POST http://localhost:${server.port}/ask \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"question": "What is vector search?"}'`);
console.log(`\n💻 Web UI available at: http://localhost:${server.port}/ui`);
