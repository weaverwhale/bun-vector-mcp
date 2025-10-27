import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  PROVIDER_TYPE,
  LLM_MODEL,
  AI_BASE_URL,
  AI_API_KEY,
} from '../constants/providers';
import { QUERY_EXPANSION_PROMPT } from '../constants/prompts';
import { QUERY_EXPANSION_COUNT } from '../constants/rag';
import { log, error } from '../utils/logger';

let llmPipeline: any = null;
let aiProvider: ReturnType<typeof createOpenAI> | null = null;

/**
 * Expand a query into multiple variations for better recall
 */
export async function expandQuery(query: string): Promise<string[]> {
  try {
    log(`[expandQuery] Expanding query: "${query}"`);

    const variations: string[] = [query]; // Always include original

    if (PROVIDER_TYPE === 'ai-sdk') {
      // Use AI SDK for query expansion
      if (!aiProvider) {
        aiProvider = createOpenAI({
          baseURL: AI_BASE_URL,
          apiKey: AI_API_KEY,
        });
      }

      const prompt = `Original question: "${query}"\n\nGenerate ${QUERY_EXPANSION_COUNT} alternative phrasings:`;

      const { text } = await generateText({
        model: aiProvider.chat(LLM_MODEL),
        messages: [
          { role: 'system', content: QUERY_EXPANSION_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      });

      const generated = parseQueryVariations(text);
      variations.push(...generated);
    } else if (PROVIDER_TYPE === 'transformers') {
      // For transformers, use rule-based expansion as LLM is expensive
      const ruleBased = generateRuleBasedVariations(query);
      variations.push(...ruleBased);
    }

    log(`[expandQuery] Generated ${variations.length} query variations`);
    return variations.slice(0, QUERY_EXPANSION_COUNT + 1);
  } catch (err) {
    error('[expandQuery] Error generating query variations:', err);
    // Fall back to rule-based
    return [
      query,
      ...generateRuleBasedVariations(query).slice(0, QUERY_EXPANSION_COUNT),
    ];
  }
}

/**
 * Parse LLM output to extract query variations
 */
function parseQueryVariations(text: string): string[] {
  const variations: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match numbered questions
    const match = trimmed.match(/^\d+[\.):\-\s]+(.+)/);
    if (match && match[1]) {
      const variation = match[1].trim();
      if (variation.length > 10) {
        variations.push(variation);
      }
    } else if (trimmed.endsWith('?') && trimmed.length > 10) {
      variations.push(trimmed);
    }
  }

  return variations;
}

/**
 * Generate rule-based query variations
 * Fallback when LLM is not available or fails
 */
function generateRuleBasedVariations(query: string): string[] {
  const variations: string[] = [];

  // Remove question words and rephrase
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
  let stripped = query.toLowerCase().trim();

  // Variation 1: Convert "How do I..." to "Methods for..."
  if (stripped.startsWith('how do i') || stripped.startsWith('how to')) {
    const rest = stripped.replace(/^how (do i|to)\s+/, '');
    variations.push(`Methods for ${rest}`);
    variations.push(`Ways to ${rest}`);
  }
  // Variation 2: Convert "What is..." to "Definition of..."
  else if (stripped.startsWith('what is') || stripped.startsWith('what are')) {
    const rest = stripped.replace(/^what (is|are)\s+/, '');
    variations.push(`Definition of ${rest}`);
    variations.push(`Explanation of ${rest}`);
  }
  // Variation 3: Convert "Why..." to "Reasons for..."
  else if (stripped.startsWith('why')) {
    const rest = stripped.replace(/^why\s+/, '');
    variations.push(`Reasons for ${rest}`);
    variations.push(`Benefits of ${rest}`);
  }
  // Generic variations
  else {
    // Add contextual terms
    variations.push(`${query} training methods`);
    variations.push(`${query} techniques and principles`);
  }

  // Variation: Add domain-specific terms
  if (!stripped.includes('strength') && !stripped.includes('training')) {
    variations.push(`${query} in strength training`);
  }

  return variations.slice(0, QUERY_EXPANSION_COUNT);
}
