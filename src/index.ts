import { initializeDatabase, getDocumentCount } from './db/schema';
import { initializeEmbeddings } from './services/embeddings';
import { initializeLLM } from './services/llm';
import { searchSimilar } from './services/search';
import { askQuestion, streamQuestion } from './services/rag';
import type {
  SearchRequest,
  SearchResponse,
  AskRequest,
  AskResponse,
  AskStreamRequest,
  StreamEvent,
} from './types/index';
import queryPageHtml from './frontend/pages/query/query.html';
import docsPageHtml from './frontend/pages/docs/docs.html';
import { DEFAULT_TOP_K, SIMILARITY_THRESHOLD } from './constants/rag';

// Initialize on startup
const db = initializeDatabase();
await initializeEmbeddings();
await initializeLLM();

const server = Bun.serve({
  port: 1738,
  idleTimeout: 120,
  routes: {
    '/': queryPageHtml,
    '/ui': queryPageHtml, // Alias for backwards compatibility
    '/docs': docsPageHtml,
    '/docs/content': {
      GET: async () => {
        try {
          const file = Bun.file('./src/frontend/pages/docs/ARCHITECTURE.md');
          const content = await file.text();
          return new Response(content, {
            headers: { 'Content-Type': 'text/plain' },
          });
        } catch (error) {
          return new Response('Documentation not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      },
    },
    '/health': {
      GET: () => {
        const count = getDocumentCount(db);
        return new Response(
          JSON.stringify({
            status: 'healthy',
            documents: count,
            timestamp: new Date().toISOString(),
            endpoints: {
              search: 'POST /search',
              ask: 'POST /ask',
              health: 'GET /health',
              home: 'GET /',
              docs: 'GET /docs',
            },
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

          const similarityThreshold =
            body.similarityThreshold &&
            typeof body.similarityThreshold === 'number'
              ? body.similarityThreshold
              : SIMILARITY_THRESHOLD;

          const startTime = performance.now();
          const results = await searchSimilar(
            db,
            body.query,
            topK,
            similarityThreshold
          );
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
          const similarityThreshold =
            body.similarityThreshold &&
            typeof body.similarityThreshold === 'number'
              ? body.similarityThreshold
              : SIMILARITY_THRESHOLD;
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
            systemPrompt,
            similarityThreshold
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
          const similarityThreshold =
            body.similarityThreshold &&
            typeof body.similarityThreshold === 'number'
              ? body.similarityThreshold
              : SIMILARITY_THRESHOLD;
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
                  systemPrompt,
                  similarityThreshold
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
console.log('  GET  / - Web UI for asking questions');
console.log('  GET  /docs - Architecture documentation');
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
console.log(`\n💻 Web UI available at: http://localhost:${server.port}`);
console.log(
  `📚 Documentation available at: http://localhost:${server.port}/docs`
);
