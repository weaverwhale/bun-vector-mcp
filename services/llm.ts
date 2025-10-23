import { pipeline, env } from "@xenova/transformers";

// Configure transformers to use local models
env.allowLocalModels = true;
env.useBrowserCache = false;

let llmPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;

export async function initializeLLM(): Promise<void> {
  if (llmPipeline) {
    return;
  }
  
  console.log("Loading local LLM model (this may take a moment on first run)...");
  
  // Using Phi-2 model - small but capable, good for local use
  // Alternative: "Xenova/LaMini-Flan-T5-783M" for faster but less capable responses
  llmPipeline = await pipeline(
    "text2text-generation",
    "Xenova/LaMini-Flan-T5-783M"
  );
  
  console.log("Local LLM model loaded successfully");
}

export async function generateAnswer(
  question: string,
  context: string,
  maxLength: number = 200,
  systemPrompt?: string
): Promise<string> {
  if (!llmPipeline) {
    await initializeLLM();
  }
  
  if (!llmPipeline) {
    throw new Error("Failed to initialize LLM pipeline");
  }
  
  // Default system prompt if none provided
  const defaultSystemPrompt = "You are a helpful assistant. Answer the question based on the provided context. Be concise and accurate.";
  const system = systemPrompt || defaultSystemPrompt;
  
  // Create a prompt with system instruction, context and question
  const prompt = `${system}\n\nContext: ${context}\n\nQuestion: ${question}\n\nAnswer:`;
  
  // Generate answer
  // @ts-expect-error - transformers.js pipeline options types are not fully accurate
  const result = await llmPipeline(prompt, {
    max_length: maxLength,
    temperature: 0.7,
    do_sample: true,
  });
  
  // Extract the generated text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const answer = (result as any)[0]?.generated_text || "I couldn't generate an answer.";
  
  return answer.trim();
}

