import { pipeline, env } from '@huggingface/transformers';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  PROVIDER_TYPE,
  LLM_MODEL,
  AI_BASE_URL,
  AI_API_KEY,
} from '../constants/providers';
import { QUESTION_GENERATION_PROMPT } from '../constants/prompts';
import { QUESTIONS_PER_CHUNK } from '../constants/rag';
import { log, error } from '../utils/logger';
import { extractKeyPhrase } from '../utils/text';
import { withRetry, LLMError } from '../utils/errors';

// Configure transformers to use local models
env.allowLocalModels = true;
env.useBrowserCache = false;

// Transformers pipeline
let llmPipeline: any = null;

// AI SDK provider
let aiProvider: ReturnType<typeof createOpenAI> | null = null;

export async function initializeQuestionGenerator(): Promise<void> {
  if (PROVIDER_TYPE === 'transformers') {
    if (llmPipeline) {
      return;
    }

    log('Initializing question generator with local model...');
    llmPipeline = await pipeline('text-generation', LLM_MODEL);
    log('Question generator initialized successfully');
  } else if (PROVIDER_TYPE === 'ai-sdk') {
    if (aiProvider) {
      return;
    }

    log('Using AI SDK for question generation:', LLM_MODEL);
    aiProvider = createOpenAI({
      baseURL: AI_BASE_URL,
      apiKey: AI_API_KEY,
    });
  }
}

/**
 * Generates hypothetical questions that the given text chunk would answer
 */
export async function generateQuestions(chunkText: string): Promise<string[]> {
  try {
    if (PROVIDER_TYPE === 'transformers') {
      if (!llmPipeline) {
        await initializeQuestionGenerator();
      }

      if (!llmPipeline) {
        throw new Error('Failed to initialize question generator');
      }

      const prompt = `${QUESTION_GENERATION_PROMPT}\n\nText:\n${chunkText}\n\nQuestions:`;

      const result = await llmPipeline(prompt, {
        max_new_tokens: 300,
        temperature: 0.7,
        do_sample: true,
        return_full_text: false,
        top_p: 0.9,
      });

      const generatedText = (result as any)[0]?.generated_text || '';

      return parseQuestions(generatedText);
    } else if (PROVIDER_TYPE === 'ai-sdk') {
      if (!aiProvider) {
        await initializeQuestionGenerator();
      }

      if (!aiProvider) {
        throw new Error('Failed to initialize AI provider');
      }

      const userPrompt = `Text:\n${chunkText}\n\nGenerate ${QUESTIONS_PER_CHUNK} questions that this text would answer:`;

      const result = await withRetry(
        async () =>
          generateText({
            model: aiProvider!.chat(LLM_MODEL),
            messages: [
              { role: 'system', content: QUESTION_GENERATION_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            topP: 0.9,
          }),
        { retryableErrors: [LLMError] }
      );

      const { text } = result;

      return parseQuestions(text);
    } else {
      throw new Error(`Unknown provider type: ${PROVIDER_TYPE}`);
    }
  } catch (err) {
    error('Error generating questions:', err);
    // Return fallback generic question if generation fails
    return [
      `What information does this document contain about ${extractKeyPhrase(chunkText)}?`,
    ];
  }
}

/**
 * Parses the LLM output to extract individual questions
 */
function parseQuestions(text: string): string[] {
  const questions: string[] = [];

  // Remove the prompt if it's still in the output
  let cleanText = text
    .replace(/Text:|Questions?:|Generate \d+ questions/gi, '')
    .trim();

  // Split by line and extract numbered questions
  const lines = cleanText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match numbered questions (e.g., "1.", "1)", "Question 1:", etc.)
    const match = trimmed.match(/^\d+[\.):\-\s]+(.+)/);
    if (match && match[1]) {
      const question = match[1].trim();
      if (question.length > 10) {
        // Basic quality filter
        questions.push(question);
      }
    } else if (trimmed.endsWith('?') && trimmed.length > 10) {
      // Also accept lines that end with ? (might not be numbered)
      questions.push(trimmed);
    }
  }

  // Ensure we have at least one question
  if (questions.length === 0) {
    // If parsing failed, try to split by question marks
    const qMarks = cleanText.split('?').filter(q => q.trim().length > 10);
    questions.push(
      ...qMarks.slice(0, QUESTIONS_PER_CHUNK).map(q => q.trim() + '?')
    );
  }

  // Limit to requested number of questions
  return questions.slice(0, QUESTIONS_PER_CHUNK);
}
