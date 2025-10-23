import { pipeline, env } from "@xenova/transformers";

// Configure transformers to use local models
env.allowLocalModels = true;
env.useBrowserCache = false;

let embeddingPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;

// LMStudio configuration (optional)
const LMSTUDIO_BASE_URL = process.env.LMSTUDIO_BASE_URL; // e.g., "http://localhost:1234/v1"
const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL; // e.g., "text-embedding-nomic-embed-text-v1.5"

export async function initializeEmbeddings(): Promise<void> {
  if (LMSTUDIO_BASE_URL) {
    console.log(`Using LMStudio embeddings: ${LMSTUDIO_BASE_URL}`);
    console.log(`Model: ${LMSTUDIO_MODEL || "default"}`);
    return;
  }

  if (embeddingPipeline) {
    return;
  }
  
  console.log("Loading local embedding model (this may take a moment on first run)...");
  
  // Using all-MiniLM-L6-v2: 384-dimensional embeddings, fast and efficient
  embeddingPipeline = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );
  
  console.log("Local embedding model loaded successfully");
}

async function generateLMStudioEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${LMSTUDIO_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: LMSTUDIO_MODEL || "text-embedding-nomic-embed-text-v1.5-embedding",
    }),
  });

  if (!response.ok) {
    throw new Error(`LMStudio API error: ${response.statusText}`);
  }

  const result = await response.json() as { data: Array<{ embedding: number[] }> };
  return result.data[0].embedding as number[];
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Use LMStudio if configured
  if (LMSTUDIO_BASE_URL) {
    return generateLMStudioEmbedding(text);
  }

  // Otherwise use local model
  if (!embeddingPipeline) {
    await initializeEmbeddings();
  }
  
  if (!embeddingPipeline) {
    throw new Error("Failed to initialize embedding pipeline");
  }
  
  // Generate embedding with mean pooling
  const output = await embeddingPipeline(
    text,
    // @ts-expect-error - transformers.js pipeline options types are not fully accurate
    { pooling: "mean" }
  );
  
  // Extract the embedding array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embedding = Array.from((output as any).data) as number[];
  
  return embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
  }
  
  return embeddings;
}

