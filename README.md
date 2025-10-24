# Vector MCP Server with Bun

A type-safe vector database built with Bun, using SQLite for storage and local embeddings for semantic search.

## Features

- 🚀 Built with Bun for maximum performance
- 📊 SQLite-based storage using `bun:sqlite`
- 🤖 Transformers or AI SDK integration with support for multiple providers
- 📄 PDF and text file support
- 🔍 Semantic search via cosine similarity
- 🛡️ Fully type-safe with TypeScript
- 🌐 REST API for searching and asking questions

## Installation

```bash
bun install
```

## Configuration

This project supports **two provider options**:

### Option 1: Transformers (Local, Default)

**No configuration needed!** Just install and run. Perfect for:

- Quick local development
- No external dependencies or API keys
- Offline usage

Uses:

- `Xenova/all-MiniLM-L6-v2` for embeddings (384 dimensions)
- `Xenova/Phi-3-mini-4k-instruct` for LLM
- Models (~80MB) download automatically on first run and are cached

### Option 2: AI SDK (LMStudio/Cloud Providers)

For more powerful models or cloud integration, set `PROVIDER_TYPE=ai-sdk` in your `.env` file:

#### LMStudio Setup

1. Download and install [LMStudio](https://lmstudio.ai/)
2. Load your preferred embedding model and LLM in LMStudio
3. Start the LMStudio server (default: `http://localhost:1234`)
4. Create a `.env` file:

```bash
PROVIDER_TYPE=ai-sdk
AI_PROVIDER=openai
AI_BASE_URL=http://localhost:1234/v1
AI_API_KEY=lm-studio

# Model names (must match models loaded in LMStudio)
LLM_MODEL=llama-3.2-3b-instruct
EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
```

#### OpenAI or Other Cloud Providers

```bash
PROVIDER_TYPE=ai-sdk
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your-openai-api-key
LLM_MODEL=gpt-4
EMBEDDING_MODEL=text-embedding-3-small
```

## MCP Integration

This vector database can be used as an MCP (Model Context Protocol) server with Claude Desktop or other MCP clients.

### Setup with Claude Desktop

1. Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mw-vector": {
      "command": "bun",
      "args": ["mcp-server.ts"],
      "cwd": "PUBLIC_ENDPOINT"
    }
  }
}
```

1. Restart Claude Desktop

2. Use the following tools in Claude:
   - `vector_search` - Search for similar content
   - `vector_ask` - Ask questions and get AI-generated answers (RAG)
   - `vector_status` - Check database status

## Usage

### 1. Feed Documents

Place your PDF and/or text files in the `./source` directory, then run:

```bash
bun run feed
```

Or specify a custom directory:

```bash
bun scripts/feed.ts /path/to/your/documents
```

This will:

- Extract text from all PDF and TXT files
- Split content into chunks (1200 chars with 200 char overlap)
- Generate embeddings using your configured embedding model
- Store everything in the SQLite database

### 2. Start the API Server

```bash
bun start
```

Or with hot reload during development:

```bash
bun run dev
```

The server will start on `http://localhost:1738`

### 3. Search or Ask Questions

#### Search for Similar Documents

```bash
curl -X POST http://localhost:1738/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your search query", "topK": 5}'
```

#### Ask Questions (RAG with LLM)

```bash
curl -X POST http://localhost:1738/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the conjugate method?"}'
```

## API Endpoints

### `GET /`

Health check and API information

### `GET /health`

Server health status and document count

### `POST /search`

Search for similar documents

## Project Structure

```text
.
├── db/
│   └── schema.ts         # Database schema and operations
├── services/
│   ├── embeddings.ts     # Embedding generation
│   ├── ingest.ts         # File processing and chunking
│   ├── llm.ts            # Local LLM for text generation
│   ├── rag.ts            # RAG implementation
│   └── search.ts         # Vector similarity search
├── scripts/
│   └── feed.ts           # CLI ingestion script
├── types/
│   └── index.ts          # TypeScript type definitions
├── index.ts              # REST API server
├── ask.html              # Ask UI
├── package.json
└── README.md
```

## How It Works

### Vector Search

1. **Ingestion**: Documents are parsed, split into overlapping chunks, and embedded using a local transformer model
2. **Storage**: Embeddings are stored as JSON arrays in SQLite alongside the text chunks
3. **Search**: Query text is embedded using the same model, then cosine similarity is computed against all stored embeddings
4. **Results**: Top-K most similar chunks are returned with their metadata

### RAG (Retrieval-Augmented Generation)

1. **Retrieval**: The question is first used to search for the most relevant document chunks (vector search)
2. **Context**: Relevant chunks are combined to form context for the LLM
3. **Generation**: A local LLM generates an answer based on the question and retrieved context
4. **Response**: The answer is returned along with source citations

## Technical Details

### Provider Comparison

| Feature         | Transformers (Default)            | AI SDK                         |
| --------------- | --------------------------------- | ------------------------------ |
| **Setup**       | Zero config, works out of the box | Requires .env configuration    |
| **Models**      | Fixed: ONNX models                | Flexible: Any compatible model |
| **Network**     | Offline capable                   | Requires server/API access     |
| **Performance** | Good for local use                | Depends on provider            |
| **Cost**        | Free                              | Free (LMStudio) or API costs   |
| **Best For**    | Quick dev, offline, privacy       | Production, powerful models    |

### Configuration

- **Default Provider**: Transformers (local)
- **Alternative Provider**: AI SDK (LMStudio/OpenAI/etc) - see `PROVIDER_TYPE` in `.env`
- **Embedding Dimensions**: 384 (transformers) or varies (AI SDK)
- **Chunk Size**: 1200 characters with 200 character overlap
- **Similarity Metric**: Cosine similarity
- **Database**: SQLite via `bun:sqlite`

## Performance

### Transformers (Default)

- First run downloads models (~80MB)
- Subsequent runs use cached models
- Works completely offline

### AI SDK

- LMStudio: Ensure models are loaded before running
- Cloud providers: API rate limits and costs may apply
- Can use more powerful models for better results

## License

MIT
