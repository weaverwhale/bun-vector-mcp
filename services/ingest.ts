import type { Database } from 'bun:sqlite';
import { insertDocument } from '../db/schema.ts';
import { generateEmbedding } from './embeddings.ts';
import type { IngestResult } from '../types/index.ts';
import { PDFParse } from 'pdf-parse';
import { CHUNK_SIZE, CHUNK_OVERLAP } from '../constants.ts';

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

  // Filter out very small chunks (less than 50 characters)
  return chunks.filter(chunk => chunk.length >= 50);
}

/**
 * Splits text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries (., !, ?) followed by space and capital letter
  // or end of string, but not on common abbreviations
  const sentences: string[] = [];
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)/g;
  let match;

  while ((match = sentenceRegex.exec(text)) !== null) {
    sentences.push(match[0].trim());
  }

  // If no matches, return the whole text as one sentence
  if (sentences.length === 0) {
    return [text];
  }

  return sentences;
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
  filePath: string
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

    // Split into chunks
    const chunks = chunkText(content);
    console.log(`  Created ${chunks.length} chunks`);

    // Generate embeddings and insert each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      console.log(`  Processing chunk ${i + 1}/${chunks.length}`);

      const embedding = await generateEmbedding(chunk);
      insertDocument(db, filename, content, chunk, embedding, i, chunk.length);
    }

    console.log(`✓ Successfully processed: ${filename}`);

    return {
      filename,
      chunks_created: chunks.length,
      success: true,
    };
  } catch (error) {
    console.error(`✗ Error processing ${filename}:`, error);
    return {
      filename,
      chunks_created: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
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
      console.log('No PDF or TXT files found in directory');
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
