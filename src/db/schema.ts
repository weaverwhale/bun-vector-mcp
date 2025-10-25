import { Database } from 'bun:sqlite';
import type { Document } from '../types/index.ts';
import { log } from '../utils/logger.ts';

const DB_PATH = process.env.DB_PATH || './vector.db';
console.log(`Using database at: ${DB_PATH}`);

export function initializeDatabase(): Database {
  const db = new Database(DB_PATH, { create: true });

  // Create documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      content TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      chunk_index INTEGER DEFAULT 0,
      chunk_size INTEGER DEFAULT 0,
      hypothetical_questions TEXT,
      question_embeddings TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Create index on filename for faster lookups
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_filename ON documents(filename)
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
  question_embeddings?: number[][]
): number {
  const stmt = db.prepare(`
    INSERT INTO documents (filename, content, chunk_text, embedding, chunk_index, chunk_size, hypothetical_questions, question_embeddings, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    filename,
    content,
    chunk_text,
    JSON.stringify(embedding),
    chunk_index,
    chunk_size,
    hypothetical_questions ? JSON.stringify(hypothetical_questions) : null,
    question_embeddings ? JSON.stringify(question_embeddings) : null,
    Date.now()
  );

  return result.lastInsertRowid as number;
}

export function getAllDocuments(db: Database): Document[] {
  const stmt = db.prepare(`
    SELECT id, filename, content, chunk_text, embedding, chunk_index, chunk_size, hypothetical_questions, question_embeddings, created_at
    FROM documents
  `);

  const rows = stmt.all() as Array<{
    id: number;
    filename: string;
    content: string;
    chunk_text: string;
    embedding: string;
    chunk_index: number;
    chunk_size: number;
    hypothetical_questions: string | null;
    question_embeddings: string | null;
    created_at: number;
  }>;

  return rows.map(row => ({
    ...row,
    embedding: JSON.parse(row.embedding) as number[],
    hypothetical_questions: row.hypothetical_questions
      ? (JSON.parse(row.hypothetical_questions) as string[])
      : undefined,
    question_embeddings: row.question_embeddings
      ? (JSON.parse(row.question_embeddings) as number[][])
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
