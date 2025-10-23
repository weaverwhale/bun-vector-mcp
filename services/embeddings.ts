import { pipeline, env } from "@xenova/transformers";

// Configure transformers to use local models
env.allowLocalModels = true;
env.useBrowserCache = false;

let embeddingPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;

export async function initializeEmbeddings(): Promise<void> {
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

export async function generateEmbedding(text: string): Promise<number[]> {
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

