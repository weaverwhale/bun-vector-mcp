import { initializeDatabase, getDocumentCount } from './db/schema.ts';
import { initializeEmbeddings } from './services/embeddings.ts';
import { initializeLLM } from './services/llm.ts';
import { searchSimilar } from './services/search.ts';
import { askQuestion, streamQuestion } from './services/rag.ts';
import type {
  SearchRequest,
  SearchResponse,
  AskRequest,
  AskResponse,
  AskStreamRequest,
  StreamEvent,
} from './types/index.ts';
import indexHtml from './index.html';
import { DEFAULT_TOP_K } from './constants/rag.ts';

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
            body.topK && typeof body.topK === 'number'
              ? body.topK
              : DEFAULT_TOP_K;

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
            body.topK && typeof body.topK === 'number'
              ? body.topK
              : DEFAULT_TOP_K;
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
    '/ask/stream': {
      POST: async req => {
        try {
          const body = (await req.json()) as AskStreamRequest;

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
            body.topK && typeof body.topK === 'number'
              ? body.topK
              : DEFAULT_TOP_K;
          const maxAnswerLength =
            body.maxAnswerLength && typeof body.maxAnswerLength === 'number'
              ? body.maxAnswerLength
              : 800;
          const systemPrompt =
            body.systemPrompt && typeof body.systemPrompt === 'string'
              ? body.systemPrompt
              : undefined;

          // Create a ReadableStream for Server-Sent Events
          const stream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();

              try {
                for await (const event of streamQuestion(
                  db,
                  body.question,
                  topK,
                  maxAnswerLength,
                  systemPrompt
                )) {
                  // Format as SSE: data: {json}\n\n
                  const sseMessage = `data: ${JSON.stringify(event)}\n\n`;
                  controller.enqueue(encoder.encode(sseMessage));
                }

                // Close the stream
                controller.close();
              } catch (error) {
                console.error('Stream error:', error);
                const errorEvent: StreamEvent = {
                  type: 'error',
                  error: error instanceof Error ? error.message : String(error),
                };
                const sseMessage = `data: ${JSON.stringify(errorEvent)}\n\n`;
                controller.enqueue(encoder.encode(sseMessage));
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error) {
          console.error('Ask stream error:', error);
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
    hmr: true,
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
console.log('  POST /ask/stream - Ask with streaming (SSE)');
console.log('\nExample search:');
console.log(`  curl -X POST http://localhost:${server.port}/search \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"query": "your search query", "topK": 5}'`);
console.log('\nExample ask:');
console.log(`  curl -X POST http://localhost:${server.port}/ask \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"question": "What is vector search?"}'`);
console.log('\nExample streaming ask:');
console.log(`  curl -N -X POST http://localhost:${server.port}/ask/stream \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"question": "What is vector search?"}'`);
console.log(`\n💻 Web UI available at: http://localhost:${server.port}/ui`);
