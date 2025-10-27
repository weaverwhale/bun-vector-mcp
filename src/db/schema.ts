import { Database } from 'bun:sqlite';
import type { Document } from '../types/index';
import { log } from '../utils/logger';
import {
  serializeVector,
  deserializeVector,
  serializeVectors,
  deserializeVectors,
} from '../utils/vectors';

const DB_PATH = process.env.DB_PATH || './vector.db';
console.log(`Using database at: ${DB_PATH}`);

export function initializeDatabase(): Database {
  const db = new Database(DB_PATH, { create: true });

  // Create documents table with BLOB storage for embeddings
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      content TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding BLOB NOT NULL,
      chunk_index INTEGER DEFAULT 0,
      chunk_size INTEGER DEFAULT 0,
      hypothetical_questions TEXT,
      question_embeddings BLOB,
      chunk_metadata TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Create indexes for faster lookups
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_filename ON documents(filename)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_chunk_index ON documents(chunk_index)
  `);

  log('Database initialized successfully');
  return db;
}

export function getDatabase(): Database {
  const db = new Database(DB_PATH);
  return db;
}

export function insertDocument(
  db: Database,
  filename: string,
  content: string,
  chunk_text: string,
  embedding: number[],
  chunk_index: number = 0,
  chunk_size: number = 0,
  hypothetical_questions?: string[],
  question_embeddings?: number[][],
  chunk_metadata?: Record<string, any>
): number {
  const stmt = db.prepare(`
    INSERT INTO documents (filename, content, chunk_text, embedding, chunk_index, chunk_size, hypothetical_questions, question_embeddings, chunk_metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    filename,
    content,
    chunk_text,
    serializeVector(embedding),
    chunk_index,
    chunk_size,
    hypothetical_questions ? JSON.stringify(hypothetical_questions) : null,
    question_embeddings ? serializeVectors(question_embeddings) : null,
    chunk_metadata ? JSON.stringify(chunk_metadata) : null,
    Date.now()
  );

  return result.lastInsertRowid as number;
}

export function getAllDocuments(db: Database): Document[] {
  const stmt = db.prepare(`
    SELECT id, filename, content, chunk_text, embedding, chunk_index, chunk_size, hypothetical_questions, question_embeddings, chunk_metadata, created_at
    FROM documents
  `);

  const rows = stmt.all() as Array<{
    id: number;
    filename: string;
    content: string;
    chunk_text: string;
    embedding: Uint8Array;
    chunk_index: number;
    chunk_size: number;
    hypothetical_questions: string | null;
    question_embeddings: Uint8Array | null;
    chunk_metadata: string | null;
    created_at: number;
  }>;

  return rows.map(row => ({
    ...row,
    embedding: deserializeVector(row.embedding),
    hypothetical_questions: row.hypothetical_questions
      ? (JSON.parse(row.hypothetical_questions) as string[])
      : undefined,
    question_embeddings: row.question_embeddings
      ? deserializeVectors(row.question_embeddings)
      : undefined,
    chunk_metadata: row.chunk_metadata
      ? (JSON.parse(row.chunk_metadata) as Record<string, any>)
      : undefined,
  }));
}

/**
 * Get chunks adjacent to a specific chunk (for context expansion)
 */
export function getAdjacentChunks(
  db: Database,
  filename: string,
  chunk_index: number,
  before: number = 1,
  after: number = 1
): Document[] {
  const stmt = db.prepare(`
    SELECT id, filename, content, chunk_text, embedding, chunk_index, chunk_size, hypothetical_questions, question_embeddings, chunk_metadata, created_at
    FROM documents
    WHERE filename = ? AND chunk_index >= ? AND chunk_index <= ?
    ORDER BY chunk_index
  `);

  const rows = stmt.all(
    filename,
    chunk_index - before,
    chunk_index + after
  ) as Array<{
    id: number;
    filename: string;
    content: string;
    chunk_text: string;
    embedding: Uint8Array;
    chunk_index: number;
    chunk_size: number;
    hypothetical_questions: string | null;
    question_embeddings: Uint8Array | null;
    chunk_metadata: string | null;
    created_at: number;
  }>;

  return rows.map(row => ({
    ...row,
    embedding: deserializeVector(row.embedding),
    hypothetical_questions: row.hypothetical_questions
      ? (JSON.parse(row.hypothetical_questions) as string[])
      : undefined,
    question_embeddings: row.question_embeddings
      ? deserializeVectors(row.question_embeddings)
      : undefined,
    chunk_metadata: row.chunk_metadata
      ? (JSON.parse(row.chunk_metadata) as Record<string, any>)
      : undefined,
  }));
}

export function getDocumentCount(db: Database): number {
  const result = db.query('SELECT COUNT(*) as count FROM documents').get() as {
    count: number;
  };
  return result.count;
}

export function clearDatabase(db: Database): void {
  db.run('DELETE FROM documents');
  log('Database cleared');
}
