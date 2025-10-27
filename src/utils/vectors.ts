/**
 * Utilities for efficient vector serialization and operations
 */

/**
 * Serialize a number array to a Float32Array buffer for BLOB storage
 * This provides ~4x storage efficiency compared to JSON
 */
export function serializeVector(vector: number[]): Uint8Array {
  const float32Array = new Float32Array(vector);
  return new Uint8Array(float32Array.buffer);
}

/**
 * Deserialize a BLOB buffer back to a number array
 */
export function deserializeVector(buffer: Uint8Array | Buffer): number[] {
  const float32Array = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / 4
  );
  return Array.from(float32Array);
}

/**
 * Serialize multiple vectors (for question embeddings)
 */
export function serializeVectors(vectors: number[][]): Uint8Array {
  // Store format: [count (4 bytes), dim (4 bytes), ...vector data]
  if (vectors.length === 0) {
    return new Uint8Array(0);
  }

  const count = vectors.length;
  const dim = vectors[0]!.length;
  const totalFloats = count * dim;

  // Create buffer with metadata
  const metaBuffer = new Uint32Array([count, dim]);
  const dataBuffer = new Float32Array(totalFloats);

  // Copy all vectors into the data buffer
  for (let i = 0; i < count; i++) {
    dataBuffer.set(vectors[i]!, i * dim);
  }

  // Combine metadata and data
  const result = new Uint8Array(8 + totalFloats * 4);
  result.set(new Uint8Array(metaBuffer.buffer), 0);
  result.set(new Uint8Array(dataBuffer.buffer), 8);

  return result;
}

/**
 * Deserialize multiple vectors
 */
export function deserializeVectors(buffer: Uint8Array | Buffer): number[][] {
  if (buffer.length === 0) {
    return [];
  }

  // Read metadata
  const metaArray = new Uint32Array(buffer.buffer, buffer.byteOffset, 2);
  const count = metaArray[0]!;
  const dim = metaArray[1]!;

  // Read vector data
  const dataArray = new Float32Array(
    buffer.buffer,
    buffer.byteOffset + 8,
    count * dim
  );

  // Split into individual vectors
  const vectors: number[][] = [];
  for (let i = 0; i < count; i++) {
    const vector = Array.from(dataArray.slice(i * dim, (i + 1) * dim));
    vectors.push(vector);
  }

  return vectors;
}

/**
 * Normalize a vector (for cosine similarity with pre-normalized vectors)
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}

/**
 * Calculate cosine similarity between two vectors
 * Optimized version with early exit
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vectors must have the same length (a: ${a.length}, b: ${b.length})`
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i]!;
    const bVal = b[i]!;
    dotProduct += aVal * bVal;
    magnitudeA += aVal * aVal;
    magnitudeB += bVal * bVal;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculate dot product (for pre-normalized vectors)
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}
