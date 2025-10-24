import { pipeline, env } from "@huggingface/transformers";
import { LLM_MODEL } from "../constants.ts";  

// Configure transformers to use local models
env.allowLocalModels = true;
env.useBrowserCache = false;

let llmPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;

export async function initializeLLM(): Promise<void> {
  if (llmPipeline) {
    return;
  }
  
  console.log(`Loading ${LLM_MODEL} (this may take a moment on first run)...`);
  
  llmPipeline = await pipeline(
    "text-generation",
    LLM_MODEL
  );
  
  console.log("Local LLM model loaded successfully");
}

export async function generateAnswer(
  question: string,
  context: string,
  maxNewTokens: number = 512,
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
  const result = await llmPipeline(prompt, {
    max_new_tokens: maxNewTokens,  // Generate up to 512 new tokens (not including prompt)
    temperature: 0.1,
    do_sample: true,
    return_full_text: false,  // Only return the generated text, not the prompt
  });
  
  // Extract the generated text
  const generatedText = (result as any)[0]?.generated_text || "I couldn't generate an answer.";
  
  // If the model still returns the full text with prompt, extract just the answer
  const answerPart = generatedText.includes("Answer:") 
    ? generatedText.split("Answer:").pop()?.trim() 
    : generatedText.trim();
  
  return answerPart || "I couldn't generate an answer.";
}

