import { CHUNK_SIZE, CHUNK_OVERLAP, MIN_CHUNK_SIZE } from '../constants/rag';
import { PDFParse } from 'pdf-parse';

/**
 * Calculate Jaccard similarity between two texts
 * Used for deduplication and text overlap detection
 */
export function calculateJaccardSimilarity(
  text1: string,
  text2: string
): number {
  const tokens1 = new Set(
    text1
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );

  const tokens2 = new Set(
    text2
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );

  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
}

/**
 * Tokenize text into words (for text analysis)
 */
export function tokenize(text: string, minLength: number = 3): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= minLength);
}

/**
 * Split text into sentences
 */
export function splitIntoSentences(text: string): string[] {
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
 * Extract key phrases from text (for fallback question generation)
 */
export function extractKeyPhrase(text: string, maxWords: number = 3): string {
  const stopWords = new Set([
    'this',
    'that',
    'with',
    'from',
    'have',
    'been',
    'will',
    'would',
    'could',
    'should',
    'there',
    'their',
    'these',
    'those',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, maxWords);

  return words.join(' ') || 'this topic';
}

/**
 * Clean and normalize text
 */
export function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Normalize text for embedding generation to handle spelling variations
 * This ensures that queries like "circa max" match "circa-max" in documents
 */
export function normalizeForEmbedding(text: string): string {
  let normalized = text;

  // Remove hyphens between words (circa-max → circa max, co-operation → cooperation)
  // But preserve hyphens in contexts like phone numbers or specific codes
  normalized = normalized.replace(/(\w)-(\w)/g, '$1 $2');

  // Remove apostrophes (don't → dont, athlete's → athletes)
  normalized = normalized.replace(/'/g, '');

  // Handle common ligatures by expanding them
  normalized = normalized
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl');

  // Normalize whitespace (multiple spaces to single space)
  normalized = normalized.replace(/\s+/g, ' ');

  // Convert to lowercase for case-insensitive matching
  normalized = normalized.toLowerCase();

  return normalized.trim();
}

/**
 * Strip HTML tags and decode entities from HTML content
 */
export function stripHtml(html: string): string {
  let text = html;

  // Remove script and style elements with their content
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Replace <br> and </p> with newlines before removing tags
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');

  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '...',
  };

  for (const [entity, replacement] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), replacement);
  }

  // Decode numeric entities (&#123; or &#xAB;)
  text = text.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
  );
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' '); // multiple spaces to single
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // max 2 newlines
  text = text.replace(/^\s+|\s+$/gm, ''); // trim lines

  return text.trim();
}

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
 * Splits text into fixed-size chunks at word boundaries
 */
export function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const word of words) {
    const testChunk = currentChunk + (currentChunk ? ' ' : '') + word;

    if (testChunk.length > CHUNK_SIZE && currentChunk.length > 0) {
      // Current chunk is full, save it and start new one
      chunks.push(currentChunk.trim());

      // Add overlap from previous chunk
      const overlapWords = currentChunk
        .split(/\s+/)
        .slice(-Math.floor(CHUNK_OVERLAP / 10));
      currentChunk = overlapWords.join(' ') + ' ' + word;
    } else {
      currentChunk = testChunk;
    }
  }

  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Filter out very small chunks
  return chunks.filter(chunk => chunk.length >= MIN_CHUNK_SIZE);
}

/**
 * Detect semantic boundaries in text (code blocks, SQL, lists, paragraphs)
 */
function detectSemanticUnits(text: string): string[] {
  const units: string[] = [];
  const lines = text.split('\n');
  
  let currentUnit = '';
  let inCodeBlock = false;
  let codeBlockFence = '';
  let inSqlBlock = false;
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmedLine = line.trim();
    
    // Detect code block start/end
    if (trimmedLine.startsWith('```')) {
      if (!inCodeBlock) {
        // Start of code block - save previous unit if exists
        if (currentUnit.trim()) {
          units.push(currentUnit.trim());
          currentUnit = '';
        }
        inCodeBlock = true;
        codeBlockFence = trimmedLine;
        currentUnit = line + '\n';
      } else {
        // End of code block
        currentUnit += line + '\n';
        units.push(currentUnit.trim());
        currentUnit = '';
        inCodeBlock = false;
        codeBlockFence = '';
      }
      continue;
    }
    
    // If in code block, just accumulate
    if (inCodeBlock) {
      currentUnit += line + '\n';
      continue;
    }
    
    // Detect SQL statements (CREATE, SELECT, INSERT, UPDATE, DELETE, WITH)
    const sqlKeywords = /^\s*(CREATE|SELECT|INSERT|UPDATE|DELETE|WITH|ALTER|DROP)\s+/i;
    if (sqlKeywords.test(line)) {
      // Save previous unit if it's not SQL
      if (currentUnit.trim() && !inSqlBlock) {
        units.push(currentUnit.trim());
        currentUnit = '';
      }
      inSqlBlock = true;
      currentUnit += line + '\n';
      continue;
    }
    
    // Detect end of SQL (semicolon or blank line after SQL)
    if (inSqlBlock) {
      currentUnit += line + '\n';
      if (line.includes(';') || (trimmedLine === '' && currentUnit.trim())) {
        units.push(currentUnit.trim());
        currentUnit = '';
        inSqlBlock = false;
      }
      continue;
    }
    
    // Detect lists (-, *, 1., etc.)
    const listPattern = /^\s*[-*•]\s+|\d+\.\s+/;
    if (listPattern.test(line)) {
      if (!inList && currentUnit.trim()) {
        units.push(currentUnit.trim());
        currentUnit = '';
      }
      inList = true;
      currentUnit += line + '\n';
      continue;
    }
    
    // If we were in a list and hit a non-list line, end the list
    if (inList && !listPattern.test(line) && trimmedLine !== '') {
      if (currentUnit.trim()) {
        units.push(currentUnit.trim());
        currentUnit = '';
      }
      inList = false;
    }
    
    // Detect paragraph breaks (double newline or heading)
    if (trimmedLine === '') {
      if (currentUnit.trim()) {
        // Don't create unit yet, just note the break
        currentUnit += '\n';
      }
      continue;
    }
    
    // Regular line - add to current unit
    currentUnit += line + '\n';
    
    // Check if current unit is getting large
    if (currentUnit.length > CHUNK_SIZE * 0.8 && trimmedLine === '') {
      // Natural break point
      if (currentUnit.trim()) {
        units.push(currentUnit.trim());
        currentUnit = '';
        inList = false;
      }
    }
  }
  
  // Add final unit
  if (currentUnit.trim()) {
    units.push(currentUnit.trim());
  }
  
  return units.filter(unit => unit.length >= MIN_CHUNK_SIZE);
}

/**
 * Semantic chunking that respects code blocks, SQL queries, lists, and semantic boundaries
 * Alternative to fixed-size chunking that keeps important content together
 */
export async function semanticChunking(text: string): Promise<string[]> {
  if (!text || text.trim().length === 0) return [];
  
  // First, detect semantic units (code blocks, SQL, lists, paragraphs)
  const units = detectSemanticUnits(text);
  
  if (units.length === 0) return [text];
  if (units.length === 1 && units[0]!.length <= CHUNK_SIZE) return units;
  
  // Now group units into chunks respecting the size limit
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const unit of units) {
    // If a single unit is larger than chunk size, it becomes its own chunk
    if (unit.length > CHUNK_SIZE * 1.5) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      chunks.push(unit);
      continue;
    }
    
    const candidateChunk = currentChunk
      ? currentChunk + '\n\n' + unit
      : unit;
    
    // If adding this unit would exceed chunk size, start a new chunk
    if (candidateChunk.length > CHUNK_SIZE && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      currentChunk = unit;
    } else {
      currentChunk = candidateChunk;
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length >= MIN_CHUNK_SIZE);
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
