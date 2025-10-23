# Vector MCP Server with Bun

A type-safe vector database built with Bun, using SQLite for storage and local embeddings for semantic search.

## Features

- 🚀 Built with Bun for maximum performance
- 📊 SQLite-based storage using `bun:sqlite`
- 🤖 Local embeddings with `@xenova/transformers` (no API keys needed)
- 📄 PDF and text file support
- 🔍 Semantic search via cosine similarity
- 🛡️ Fully type-safe with TypeScript
- 🌐 REST API for searching

## Installation

```bash
bun install
```

## Embeddings

Uses local embeddings via `@xenova/transformers` with the Xenova/all-MiniLM-L6-v2 model (384 dimensions). No API keys or external services needed. The model (~80MB) downloads automatically on first run and is cached locally for subsequent use.

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
      "cwd": "/Users/michaelweaver/Websites/mw-vector"
    }
  }
}
```

2. Restart Claude Desktop

3. Use the following tools in Claude:
   - `vector_search` - Search for similar content
   - `vector_ingest_file` - Add a single file
   - `vector_ingest_directory` - Add all files from a folder
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
- Split content into chunks (500 chars with 100 char overlap)
- Generate embeddings using the all-MiniLM-L6-v2 model
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

### 3. Search Documents

#### Using curl:

```bash
curl -X POST http://localhost:1738/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your search query", "topK": 5}'
```

#### Using JavaScript:

```javascript
const response = await fetch('http://localhost:1738/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'your search query',
    topK: 5  // optional, defaults to 5
  })
});

const results = await response.json();
console.log(results);
```

## API Endpoints

### `GET /`
Health check and API information

### `GET /health`
Server health status and document count

### `POST /search`
Search for similar documents

**Request Body:**
```json
{
  "query": "your search query",
  "topK": 5
}
```

**Response:**
```json
{
  "results": [
    {
      "id": 1,
      "filename": "document.pdf",
      "chunk_text": "relevant text chunk...",
      "similarity": 0.89
    }
  ],
  "query": "your search query",
  "took_ms": 42.5
}
```

## Project Structure

```
.
├── db/
│   └── schema.ts         # Database schema and operations
├── services/
│   ├── embeddings.ts     # Embedding generation
│   ├── ingest.ts         # File processing and chunking
│   └── search.ts         # Vector similarity search
├── scripts/
│   └── feed.ts           # CLI ingestion script
├── types/
│   └── index.ts          # TypeScript type definitions
├── index.ts              # REST API server
├── package.json
└── README.md
```

## How It Works

1. **Ingestion**: Documents are parsed, split into overlapping chunks, and embedded using a local transformer model
2. **Storage**: Embeddings are stored as JSON arrays in SQLite alongside the text chunks
3. **Search**: Query text is embedded using the same model, then cosine similarity is computed against all stored embeddings
4. **Results**: Top-K most similar chunks are returned with their metadata

## Technical Details

- **Embedding Model**: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- **Chunk Size**: 500 characters with 100 character overlap
- **Similarity Metric**: Cosine similarity
- **Database**: SQLite via `bun:sqlite`

## Performance

The first time you run the feed script, the embedding model (~80MB) will be downloaded and cached locally. Subsequent runs will be much faster.

## License

MIT
