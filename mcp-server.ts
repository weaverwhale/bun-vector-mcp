#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { initializeDatabase, getDatabase, getDocumentCount } from "./db/schema.ts";
import { initializeEmbeddings } from "./services/embeddings.ts";
import { initializeLLM } from "./services/llm.ts";
import { ingestFile, ingestDirectory } from "./services/ingest.ts";
import { searchSimilar } from "./services/search.ts";
import { askQuestion } from "./services/rag.ts";
import { EMBEDDING_MODEL, LLM_MODEL } from "./constants.ts";

// Initialize database, embeddings, and LLM
const db = initializeDatabase();
await initializeEmbeddings();
await initializeLLM();

const server = new Server(
  {
    name: "vector-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "vector_search",
        description: "Search the vector database for semantically similar content to a query",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query text",
            },
            topK: {
              type: "number",
              description: "Number of results to return (default: 5)",
              default: 5,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "vector_ingest_file",
        description: "Ingest a single PDF or text file into the vector database",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the PDF or text file to ingest",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "vector_ingest_directory",
        description: "Ingest all PDF and text files from a directory into the vector database",
        inputSchema: {
          type: "object",
          properties: {
            directoryPath: {
              type: "string",
              description: "Path to the directory containing files to ingest",
            },
          },
          required: ["directoryPath"],
        },
      },
      {
        name: "vector_status",
        description: "Get the current status of the vector database (number of documents)",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "vector_ask",
        description: "Ask a question and get an AI-generated answer based on relevant documents from the vector database (RAG)",
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The question to ask",
            },
            topK: {
              type: "number",
              description: "Number of relevant documents to use as context (default: 3)",
              default: 3,
            },
            maxAnswerLength: {
              type: "number",
              description: "Maximum length of the answer in tokens (default: 200)",
              default: 200,
            },
            systemPrompt: {
              type: "string",
              description: "Optional custom system prompt for the AI",
            },
          },
          required: ["question"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "vector_search": {
        const query = args?.query as string;
        const topK = (args?.topK as number) || 5;

        if (!query) {
          throw new Error("Query parameter is required");
        }

        const startTime = performance.now();
        const results = await searchSimilar(db, query, topK);
        const endTime = performance.now();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  results,
                  query,
                  took_ms: Math.round((endTime - startTime) * 100) / 100,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "vector_ingest_file": {
        const filePath = args?.filePath as string;

        if (!filePath) {
          throw new Error("filePath parameter is required");
        }

        const result = await ingestFile(db, filePath);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "vector_ingest_directory": {
        const directoryPath = args?.directoryPath as string;

        if (!directoryPath) {
          throw new Error("directoryPath parameter is required");
        }

        const results = await ingestDirectory(db, directoryPath);
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);
        const totalChunks = successful.reduce((sum, r) => sum + r.chunks_created, 0);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total_files: results.length,
                  successful: successful.length,
                  failed: failed.length,
                  total_chunks: totalChunks,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "vector_status": {
        const count = getDocumentCount(db);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "online",
                  document_chunks: count,
                  embedding_model: EMBEDDING_MODEL,
                  llm_model: LLM_MODEL,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "vector_ask": {
        const question = args?.question as string;
        const topK = (args?.topK as number) || 3;
        const maxAnswerLength = (args?.maxAnswerLength as number) || 200;
        const systemPrompt = args?.systemPrompt as string | undefined;

        if (!question) {
          throw new Error("question parameter is required");
        }

        const startTime = performance.now();
        const result = await askQuestion(db, question, topK, maxAnswerLength, systemPrompt);
        const endTime = performance.now();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...result,
                  took_ms: Math.round((endTime - startTime) * 100) / 100,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Vector Database Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

