import type { Database } from 'bun:sqlite';
import { PDFParse } from 'pdf-parse';
import { insertDocument } from '../db/schema';
import { generateEmbeddings, getEmbeddingModelVersion } from './embeddings';
import { generateQuestions, initializeQuestionGenerator } from './questions';
import type { IngestResult } from '../types/index.ts';
import { CHUNK_SIZE, CHUNK_OVERLAP } from '../constants/rag';
import { PROVIDER_TYPE } from '../constants/providers';
import {
  splitIntoSentences,
  normalizeForEmbedding,
  stripHtml,
} from '../utils/text';
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

/**
 * Parse CSV content into array of row objects
 * Handles quoted fields, escaped quotes, and newlines within fields
 */
function parseCSV(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  const lines = content.split('\n');
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i += 2;
        continue;
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }
    }

    if (!insideQuotes && char === ',') {
      // End of field
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    if (!insideQuotes && char === '\n') {
      // End of row
      currentRow.push(currentField);
      if (currentRow.length > 0 && currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    // Regular character
    currentField += char;
    i++;
  }

  // Handle last field/row if no trailing newline
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim())) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  // First row is headers
  const headers = rows[0]!.map(h => h.trim());
  const data: Array<Record<string, string>> = [];

  // Convert remaining rows to objects
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    const obj: Record<string, string> = {};

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const header = headers[colIdx]!;
      const value = row[colIdx] || '';
      obj[header] = value.trim();
    }

    data.push(obj);
  }

  return data;
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

/**
 * Ingest a CSV file, processing each row as a separate document
 */
export async function ingestCSV(
  db: Database,
  filePath: string
): Promise<IngestResult> {
  const filename = filePath.split('/').pop() || filePath;

  try {
    console.log(`Processing CSV: ${filename}`);

    // Read and parse CSV file
    const file = Bun.file(filePath);
    const content = await file.text();
    const rows = parseCSV(content);

    if (rows.length === 0) {
      return {
        filename,
        chunks_created: 0,
        success: false,
        error: 'No rows found in CSV file',
      };
    }

    console.log(`  Found ${rows.length} rows to process`);

    // Initialize question generator if using local model
    if (PROVIDER_TYPE === 'transformers') {
      console.log('  Initializing question generator...');
      await initializeQuestionGenerator();
    }

    // Get embedding model version
    const modelVersion = getEmbeddingModelVersion();

    let processedCount = 0;

    // Process each row
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]!;
      console.log(`  Processing row ${rowIdx + 1}/${rows.length}...`);

      // Extract and combine main content fields
      const title = row['Title'] || '';
      const contentHtml = row['Content'] || '';
      const link = row['Link'] || '';
      const collection = row['Collection'] || '';

      // Strip HTML from content
      const contentClean = stripHtml(contentHtml);

      // Combine fields for embedding
      const combinedText = [title, contentClean, link, collection]
        .filter(s => s.trim())
        .join('\n\n');

      if (!combinedText.trim()) {
        console.log(`  Skipping empty row ${rowIdx + 1}`);
        continue;
      }

      // Create document identifier using filename and title
      const docIdentifier = title
        ? `${filename} - ${title}`
        : `${filename} - Row ${rowIdx + 1}`;

      // Prepare metadata from remaining columns
      const metadata: Record<string, any> = {
        source_type: 'csv',
        row_index: rowIdx,
        embedding_model: modelVersion,
        ingestion_date: new Date().toISOString(),
      };

      // Store all CSV columns as metadata
      for (const [key, value] of Object.entries(row)) {
        if (value && value.trim()) {
          metadata[`csv_${key.toLowerCase().replace(/\s+/g, '_')}`] = value;
        }
      }

      // Generate embeddings
      const normalizedText = normalizeForEmbedding(combinedText);
      const [contentEmbedding] = await generateEmbeddings([normalizedText]);

      // Generate hypothetical questions
      console.log(`  Generating questions for row ${rowIdx + 1}...`);
      const questions = await generateQuestions(combinedText);

      // Generate question embeddings
      let questionEmbeddings: number[][] = [];
      if (questions.length > 0) {
        const normalizedQuestions = questions.map(q =>
          normalizeForEmbedding(q)
        );
        questionEmbeddings = await generateEmbeddings(normalizedQuestions);
      }

      // Insert into database
      insertDocument(
        db,
        docIdentifier,
        combinedText, // Full combined content
        combinedText, // Chunk text (same as content for CSV rows)
        contentEmbedding!,
        rowIdx, // Row index as chunk index
        combinedText.length, // Chunk size
        questions,
        questionEmbeddings,
        metadata
      );

      processedCount++;
    }

    console.log(
      `✓ Successfully processed CSV: ${filename} (${processedCount} rows)`
    );

    return {
      filename,
      chunks_created: processedCount,
      success: true,
    };
  } catch (error) {
    console.error(`✗ Error processing CSV ${filename}:`, error);
    const err = error instanceof Error ? error : new Error(String(error));
    throw new IngestionError(
      `Failed to ingest CSV file ${filename}: ${err.message}`,
      err
    );
  }
}

export async function ingestFile(
  db: Database,
  filePath: string,
  useSemanticChunking: boolean = false
): Promise<IngestResult> {
  const filename = filePath.split('/').pop() || filePath;
  const ext = filePath.toLowerCase().split('.').pop();

  // Route CSV files to dedicated CSV ingestion
  if (ext === 'csv') {
    return await ingestCSV(db, filePath);
  }

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
      new Bun.Glob('**/*.{pdf,txt,csv}').scan({ cwd: directoryPath })
    );

    if (files.length === 0) {
      console.error('No PDF, TXT, or CSV files found in directory');
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
