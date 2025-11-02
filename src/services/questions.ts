import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { LLM_MODEL, AI_BASE_URL, AI_API_KEY } from '../constants/providers';
import { QUESTION_GENERATION_PROMPT } from '../constants/prompts';
import { QUESTIONS_PER_CHUNK } from '../constants/rag';
import { log, error } from '../utils/logger';
import { extractKeyPhrase } from '../utils/text';
import { withRetry, LLMError } from '../utils/errors';

// AI SDK provider
let aiProvider: ReturnType<typeof createOpenAI> | null = null;

export async function initializeQuestionGenerator(): Promise<void> {
  if (aiProvider) {
    return;
  }

  log('Generating questions with model:', LLM_MODEL);
  aiProvider = createOpenAI({
    baseURL: AI_BASE_URL,
    apiKey: AI_API_KEY,
  });
}

export async function generateQuestions(chunkText: string): Promise<string[]> {
  try {
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
