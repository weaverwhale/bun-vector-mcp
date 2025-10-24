import { pipeline, env } from "@huggingface/transformers";
import { LLM_MODEL, MAX_ANSWER_TOKENS, GENERATION_TEMPERATURE } from "../constants.ts";  

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
  maxNewTokens: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string
): Promise<string> {
  if (!llmPipeline) {
    await initializeLLM();
  }
  
  if (!llmPipeline) {
    throw new Error("Failed to initialize LLM pipeline");
  }
  
  // Enhanced system prompt for fitness/strength training domain
  const defaultSystemPrompt = `You are an expert strength and conditioning coach with deep knowledge of training methodologies, exercise science, and athletic performance. 

Your task is to answer questions based ONLY on the information provided in the Context below. Follow these guidelines:

1. Be thorough and comprehensive - use ALL relevant information from the context
2. Provide complete explanations with specific details, methods, and principles
3. If the context mentions specific training systems, methods, or terminology, explain them fully
4. Structure your answer logically with clear explanations
5. If the context provides examples, protocols, or guidelines, include them
6. If the context does not contain enough information to fully answer the question, clearly state what information is missing
7. DO NOT make up information or draw from knowledge outside the provided context

Context sections are numbered [1], [2], etc. Use information from all relevant sections.`;
  
  const system = systemPrompt || defaultSystemPrompt;
  
  // Create a well-structured prompt
  const prompt = `${system}

Context:
${context}

Question: ${question}

Provide a detailed, comprehensive answer based on the context above:`;
  
  // Generate answer with improved parameters
  const result = await llmPipeline(prompt, {
    max_new_tokens: maxNewTokens,
    temperature: GENERATION_TEMPERATURE,
    do_sample: true,
    return_full_text: false,
    repetition_penalty: 1.1, // Reduce repetition
    top_p: 0.9, // Nucleus sampling for better quality
  });
  
  // Extract the generated text
  const generatedText = (result as any)[0]?.generated_text || "I couldn't generate an answer.";
  
  // Clean up the answer
  let answer = generatedText.trim();
  
  // If the model still returns the full text with prompt, extract just the answer
  if (answer.includes("Provide a detailed")) {
    const parts = answer.split(/(?:Provide a detailed|Answer:)/i);
    answer = parts[parts.length - 1]?.trim() || answer;
  }
  
  // Remove any remaining prompt fragments
  answer = answer.replace(/^(?:Answer:|Response:)\s*/i, '').trim();
  
  return answer || "I couldn't generate an answer.";
}

