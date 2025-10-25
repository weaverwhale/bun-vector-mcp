import { pipeline, env } from '@huggingface/transformers';
import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  PROVIDER_TYPE,
  LLM_MODEL,
  AI_BASE_URL,
  AI_API_KEY,
} from '../constants/providers';
import { MAX_ANSWER_TOKENS, GENERATION_TEMPERATURE } from '../constants/rag';
import { DEFAULT_SYSTEM_PROMPT } from '../constants/prompts';
import { log, error } from '../utils/logger';

// Configure transformers to use local models
env.allowLocalModels = true;
env.useBrowserCache = false;

// Transformers pipeline
let llmPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;

// AI SDK provider
let aiProvider: ReturnType<typeof createOpenAI> | null = null;

export async function initializeLLM(): Promise<void> {
  if (PROVIDER_TYPE === 'transformers') {
    if (llmPipeline) {
      return;
    }

    log(`Loading ${LLM_MODEL} (this may take a moment on first run)...`);

    llmPipeline = await pipeline('text-generation', LLM_MODEL);
    log('Local LLM model loaded successfully');
  } else if (PROVIDER_TYPE === 'ai-sdk') {
    if (aiProvider) {
      return;
    }

    log('Using AI SDK with LLM model:', LLM_MODEL);
    log('Base URL:', AI_BASE_URL);

    aiProvider = createOpenAI({
      baseURL: AI_BASE_URL,
      apiKey: AI_API_KEY,
    });
  }
}

export async function generateAnswer(
  question: string,
  context: string,
  maxNewTokens: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string
): Promise<string> {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  if (PROVIDER_TYPE === 'transformers') {
    if (!llmPipeline) {
      await initializeLLM();
    }

    if (!llmPipeline) {
      throw new Error('Failed to initialize LLM pipeline');
    }

    // Create a well-structured prompt
    const prompt = `${system}\n\n${context}\n\n${question}`;

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
    const generatedText =
      (result as any)[0]?.generated_text || "I couldn't generate an answer.";

    // Clean up the answer
    let answer = generatedText.trim();

    // If the model still returns the full text with prompt, extract just the answer
    if (answer.includes('Provide a detailed')) {
      const parts = answer.split(/(?:Provide a detailed|Answer:)/i);
      answer = parts[parts.length - 1]?.trim() || answer;
    }

    // Remove any remaining prompt fragments
    answer = answer.replace(/^(?:Answer:|Response:)\s*/i, '').trim();

    return answer || "I couldn't generate an answer.";
  } else if (PROVIDER_TYPE === 'ai-sdk') {
    if (!aiProvider) {
      await initializeLLM();
    }

    if (!aiProvider) {
      throw new Error('Failed to initialize AI provider');
    }

    try {
      // Create a well-structured prompt
      const userPrompt = `${context}\n\n${question}`;

      // Generate answer using AI SDK with chat completions
      // Note: Token limits are controlled via the model's settings in LMStudio
      const { text } = await generateText({
        model: aiProvider.chat(LLM_MODEL),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        temperature: GENERATION_TEMPERATURE,
        topP: 0.9,
      });

      // Clean up the answer
      let answer = text.trim();

      // Remove any remaining prompt fragments
      answer = answer.replace(/^(?:Answer:|Response:)\s*/i, '').trim();

      return answer || "I couldn't generate an answer.";
    } catch (err) {
      error('Error generating answer:', err);
      throw new Error(`Failed to generate answer: ${err}`);
    }
  } else {
    throw new Error(`Unknown provider type: ${PROVIDER_TYPE}`);
  }
}

/**
 * Stream answer generation with support for both providers
 * Yields text chunks progressively
 */
export async function* streamAnswer(
  question: string,
  context: string,
  maxNewTokens: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string
): AsyncGenerator<string, void, undefined> {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  if (PROVIDER_TYPE === 'transformers') {
    // Transformers doesn't natively support streaming, so we simulate it
    // by generating the full response and yielding it in chunks
    if (!llmPipeline) {
      await initializeLLM();
    }

    if (!llmPipeline) {
      throw new Error('Failed to initialize LLM pipeline');
    }

    const prompt = `${system}\n\n${context}\n\n${question}`;

    const result = await llmPipeline(prompt, {
      max_new_tokens: maxNewTokens,
      temperature: GENERATION_TEMPERATURE,
      do_sample: true,
      return_full_text: false,
      repetition_penalty: 1.1,
      top_p: 0.9,
    });

    const generatedText =
      (result as any)[0]?.generated_text || "I couldn't generate an answer.";

    let answer = generatedText.trim();

    if (answer.includes('Provide a detailed')) {
      const parts = answer.split(/(?:Provide a detailed|Answer:)/i);
      answer = parts[parts.length - 1]?.trim() || answer;
    }

    answer = answer.replace(/^(?:Answer:|Response:)\s*/i, '').trim();

    // Simulate streaming by yielding words one at a time
    const words = answer.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield i === 0 ? words[i] : ' ' + words[i];
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  } else if (PROVIDER_TYPE === 'ai-sdk') {
    if (!aiProvider) {
      await initializeLLM();
    }

    if (!aiProvider) {
      throw new Error('Failed to initialize AI provider');
    }

    try {
      const userPrompt = `${context}\n\n${question}`;

      const result = streamText({
        model: aiProvider.chat(LLM_MODEL),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        temperature: GENERATION_TEMPERATURE,
        topP: 0.9,
      });

      // Stream text deltas as they arrive
      for await (const textPart of result.textStream) {
        yield textPart;
      }
    } catch (err) {
      error('Error streaming answer:', err);
      throw new Error(`Failed to stream answer: ${err}`);
    }
  } else {
    throw new Error(`Unknown provider type: ${PROVIDER_TYPE}`);
  }
}
