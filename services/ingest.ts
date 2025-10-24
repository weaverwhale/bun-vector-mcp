import type { Database } from "bun:sqlite";
import { insertDocument } from "../db/schema.ts";
import { generateEmbedding } from "./embeddings.ts";
import type { IngestResult } from "../types/index.ts";
import { PDFParse } from 'pdf-parse';

const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 100; // overlap between chunks

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  
  return chunks;
}

export async function extractTextFromPDF(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const arrayBuffer = await file.arrayBuffer();
  // Convert to Uint8Array instead of Buffer for Bun compatibility
  const uint8Array = new Uint8Array(arrayBuffer);
  const parser = new PDFParse({ data: uint8Array });
  const result = await parser.getText();
  await parser.destroy();

  return result.text;
}

export async function extractTextFromFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const ext = filePath.toLowerCase().split('.').pop();
  
  if (ext === 'pdf') {
    return await extractTextFromPDF(filePath);
  } else {
    // For text files, just read directly
    return await file.text();
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
        error: "No text content found in file"
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
      insertDocument(db, filename, content, chunk, embedding);
    }
    
    console.log(`✓ Successfully processed: ${filename}`);
    
    return {
      filename,
      chunks_created: chunks.length,
      success: true
    };
  } catch (error) {
    console.error(`✗ Error processing ${filename}:`, error);
    return {
      filename,
      chunks_created: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error)
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
      new Bun.Glob("**/*.{pdf,txt}").scan({ cwd: directoryPath })
    );
    
    if (files.length === 0) {
      console.log("No PDF or TXT files found in directory");
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
    console.error("Error reading directory:", error);
    return results;
  }
}

