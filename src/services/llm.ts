import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  LLM_MODEL,
  AI_BASE_URL,
  AI_API_KEY,
} from '../constants/providers';
import { MAX_ANSWER_TOKENS, GENERATION_TEMPERATURE } from '../constants/rag';
import { DEFAULT_SYSTEM_PROMPT } from '../constants/prompts';
import { log, error } from '../utils/logger';

// AI SDK provider
let aiProvider: ReturnType<typeof createOpenAI> | null = null;

export async function initializeLLM(): Promise<void> {
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

export async function generateAnswer(
  question: string,
  context: string,
  maxNewTokens: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string
): Promise<string> {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;

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
}

export async function* streamAnswer(
  question: string,
  context: string,
  maxNewTokens: number = MAX_ANSWER_TOKENS,
  systemPrompt?: string
): AsyncGenerator<string, void, undefined> {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;

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
}
