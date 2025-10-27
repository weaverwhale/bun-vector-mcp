import type { Database } from 'bun:sqlite';
import { PDFParse } from 'pdf-parse';
import { insertDocument } from '../db/schema';
import { generateEmbeddings, getEmbeddingModelVersion } from './embeddings';
import { generateQuestions, initializeQuestionGenerator } from './questions';
import type { IngestResult } from '../types/index.ts';
import { CHUNK_SIZE, CHUNK_OVERLAP } from '../constants/rag';
import { PROVIDER_TYPE } from '../constants/providers';
import { splitIntoSentences, normalizeForEmbedding } from '../utils/text';
import { IngestionError } from '../utils/errors';

/**
 * Cleans PDF text by removing common artifacts and normalizing whitespace
 */
export function cleanPDFText(text: string): string {
  let cleaned = text;

  // Remove page numbers (various formats)
  cleaned = cleaned.replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, '');
  cleaned = cleaned.replace(/\b\d+\s+of\s+\d+\b/g, '');
  cleaned = cleaned.replace(/^\s*\d+\s*$/gm, ''); // standalone numbers on lines

  // Remove common header/footer patterns
  cleaned = cleaned.replace(/^[-_=]+$/gm, ''); // lines of dashes/underscores
  cleaned = cleaned.replace(/^\s*\[.*?\]\s*$/gm, ''); // lines with just [text]

  // Fix hyphenated words split across lines
  cleaned = cleaned.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2');

  // Normalize whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' '); // multiple spaces/tabs to single space
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // max 2 consecutive newlines
  cleaned = cleaned.replace(/\r\n/g, '\n'); // normalize line endings

  // Remove leading/trailing whitespace from lines
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // Remove excessive spaces around punctuation
  cleaned = cleaned.replace(/\s+([.,;:!?])/g, '$1');
  cleaned = cleaned.replace(/([.,;:!?])\s+/g, '$1 ');

  return cleaned.trim();
}

/**
 * Splits text into chunks with sentence-boundary awareness
 */
export function chunkText(text: string): string[] {
  const chunks: string[] = [];

  // Split on paragraph boundaries first (double newlines)
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    // If adding this paragraph would exceed chunk size
    if (currentChunk.length + trimmedParagraph.length > CHUNK_SIZE) {
      // If we have content, save it
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());

        // Start new chunk with overlap from previous chunk
        const overlapText = getOverlapText(currentChunk, CHUNK_OVERLAP);
        currentChunk = overlapText
          ? overlapText + '\n\n' + trimmedParagraph
          : trimmedParagraph;
      } else {
        // Paragraph itself is larger than chunk size, split by sentences
        const sentences = splitIntoSentences(trimmedParagraph);
        let sentenceChunk = '';

        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length > CHUNK_SIZE) {
            if (sentenceChunk.length > 0) {
              chunks.push(sentenceChunk.trim());
              const overlapText = getOverlapText(sentenceChunk, CHUNK_OVERLAP);
              sentenceChunk = overlapText
                ? overlapText + ' ' + sentence
                : sentence;
            } else {
              // Single sentence larger than chunk size, just add it
              chunks.push(sentence.trim());
              sentenceChunk = '';
            }
          } else {
            sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
          }
        }

        if (sentenceChunk.length > 0) {
          currentChunk = sentenceChunk;
        }
      }
    } else {
      // Add paragraph to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
    }
  }

  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Filter out very small chunks
  return chunks.filter(chunk => chunk.length >= 50);
}

/**
 * Semantic chunking using embedding similarity to detect topic boundaries
 * Alternative to fixed-size chunking that respects semantic coherence
 */
export async function semanticChunking(text: string): Promise<string[]> {
  // Split into sentences first
  const sentences = splitIntoSentences(text);

  if (sentences.length === 0) return [];
  if (sentences.length === 1) return [text];

  // For semantic chunking, we group sentences into chunks based on semantic similarity
  // This is computationally expensive, so we use a hybrid approach:
  // 1. Group sentences into candidate chunks
  // 2. Merge adjacent chunks if they're semantically similar

  const chunks: string[] = [];
  let currentChunk = '';
  let sentenceCount = 0;

  for (const sentence of sentences) {
    const candidateChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;

    // If chunk is getting large, consider splitting
    if (candidateChunk.length > CHUNK_SIZE) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        sentenceCount = 1;
      } else {
        // Single sentence larger than chunk size
        chunks.push(sentence.trim());
        currentChunk = '';
        sentenceCount = 0;
      }
    } else {
      currentChunk = candidateChunk;
      sentenceCount++;
    }
  }

  // Add last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(chunk => chunk.length >= 50);
}

/**
 * Gets the last N characters of text, trying to start at a sentence boundary
 */
function getOverlapText(text: string, targetLength: number): string {
  if (text.length <= targetLength) {
    return text;
  }

  const startPos = text.length - targetLength;
  const substring = text.substring(startPos);

  // Try to find a sentence boundary (., !, ?) in the overlap region
  const sentenceBoundary = substring.search(/[.!?]\s+/);

  if (sentenceBoundary !== -1) {
    return substring.substring(sentenceBoundary + 2).trim();
  }

  // Otherwise, try to find a word boundary
  const wordBoundary = substring.indexOf(' ');
  if (wordBoundary !== -1) {
    return substring.substring(wordBoundary + 1).trim();
  }

  return substring.trim();
}

export async function extractTextFromPDF(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const arrayBuffer = await file.arrayBuffer();
  // Convert to Uint8Array instead of Buffer for Bun compatibility
  const uint8Array = new Uint8Array(arrayBuffer);
  const parser = new PDFParse({ data: uint8Array });
  const result = await parser.getText();
  await parser.destroy();

  // Clean the extracted text
  return cleanPDFText(result.text);
}

export async function extractTextFromFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const ext = filePath.toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    return await extractTextFromPDF(filePath);
  } else {
    // For text files, read and clean
    const text = await file.text();
    return cleanPDFText(text); // Clean text files too
  }
}

export async function ingestFile(
  db: Database,
  filePath: string,
  useSemanticChunking: boolean = false
): Promise<IngestResult> {
  const filename = filePath.split('/').pop() || filePath;

  try {
    console.log(`Processing: ${filename}`);

    // Extract text from file
    const content = await extractTextFromFile(filePath);

    if (!content || content.trim().length === 0) {
      return {
        filename,
        chunks_created: 0,
        success: false,
        error: 'No text content found in file',
      };
    }

    // Split into chunks (semantic or fixed-size)
    const chunks = useSemanticChunking
      ? await semanticChunking(content)
      : chunkText(content);
    console.log(`  Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return {
        filename,
        chunks_created: 0,
        success: false,
        error: 'No valid chunks created from content',
      };
    }

    // Initialize question generator if using local model (transformers)
    if (PROVIDER_TYPE === 'transformers') {
      console.log('  Initializing question generator...');
      await initializeQuestionGenerator();
    }

    // Batch process embeddings and questions
    console.log('  Generating embeddings for all chunks...');
    // Normalize chunks for embedding to handle spelling variations
    const normalizedChunks = chunks.map(chunk => normalizeForEmbedding(chunk));
    const contentEmbeddings = await generateEmbeddings(normalizedChunks);

    console.log('  Generating questions for all chunks...');
    const allQuestions: string[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      console.log(`  Generating questions for chunk ${i + 1}/${chunks.length}`);
      const questions = await generateQuestions(chunk);
      allQuestions.push(questions);
    }

    // Batch generate question embeddings
    console.log('  Generating question embeddings...');
    const allQuestionEmbeddings: number[][][] = [];
    for (const questions of allQuestions) {
      if (questions.length > 0) {
        // Normalize questions for embedding to handle spelling variations
        const normalizedQuestions = questions.map(q =>
          normalizeForEmbedding(q)
        );
        const questionEmbeddings =
          await generateEmbeddings(normalizedQuestions);
        allQuestionEmbeddings.push(questionEmbeddings);
      } else {
        allQuestionEmbeddings.push([]);
      }
    }

    // Get embedding model version for metadata
    const modelVersion = getEmbeddingModelVersion();

    // Insert all chunks into database
    console.log('  Inserting chunks into database...');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const contentEmbedding = contentEmbeddings[i]!;
      const questions = allQuestions[i]!;
      const questionEmbeddings = allQuestionEmbeddings[i]!;

      // Create enhanced chunk metadata
      const chunkMetadata = {
        chunk_index: i,
        total_chunks: chunks.length,
        char_start: content.indexOf(chunk),
        char_end: content.indexOf(chunk) + chunk.length,
        embedding_model: modelVersion,
        chunking_strategy: useSemanticChunking ? 'semantic' : 'fixed-size',
        ingestion_date: new Date().toISOString(),
      };

      // Insert document with embeddings and metadata
      insertDocument(
        db,
        filename,
        content,
        chunk,
        contentEmbedding,
        i,
        chunk.length,
        questions,
        questionEmbeddings,
        chunkMetadata
      );
    }

    console.log(`✓ Successfully processed: ${filename}`);

    return {
      filename,
      chunks_created: chunks.length,
      success: true,
    };
  } catch (error) {
    console.error(`✗ Error processing ${filename}:`, error);
    const err = error instanceof Error ? error : new Error(String(error));
    throw new IngestionError(
      `Failed to ingest file ${filename}: ${err.message}`,
      err
    );
  }
}

export async function ingestDirectory(
  db: Database,
  directoryPath: string
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];

  try {
    // Read directory contents using Bun's native Glob API
    const files = await Array.fromAsync(
      new Bun.Glob('**/*.{pdf,txt}').scan({ cwd: directoryPath })
    );

    if (files.length === 0) {
      console.error('No PDF or TXT files found in directory');
      return results;
    }

    console.log(`Found ${files.length} files to process\n`);

    for (const file of files) {
      const fullPath = `${directoryPath}/${file}`;
      const result = await ingestFile(db, fullPath);
      results.push(result);
    }

    return results;
  } catch (error) {
    console.error('Error reading directory:', error);
    return results;
  }
}
