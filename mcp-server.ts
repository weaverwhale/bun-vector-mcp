#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { initializeDatabase, getDatabase, getDocumentCount } from "./db/schema.ts";
import { initializeEmbeddings } from "./services/embeddings.ts";
import { ingestFile, ingestDirectory } from "./services/ingest.ts";
import { searchSimilar } from "./services/search.ts";

// Initialize database and embeddings
const db = initializeDatabase();
await initializeEmbeddings();

const server = new Server(
  {
    name: "mw-vector",
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
                  embedding_model: "Xenova/all-MiniLM-L6-v2",
                  dimensions: 384,
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

