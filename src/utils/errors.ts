import { error as logError } from './logger';

/**
 * Custom error types for better error handling
 */
export class EmbeddingError extends Error {
  public readonly errorCause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EmbeddingError';
    this.errorCause = cause;
  }
}

export class DatabaseError extends Error {
  public readonly errorCause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.errorCause = cause;
  }
}

export class LLMError extends Error {
  public readonly errorCause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LLMError';
    this.errorCause = cause;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class IngestionError extends Error {
  public readonly errorCause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'IngestionError';
    this.errorCause = cause;
  }
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: Array<new (...args: any[]) => Error>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let delayMs = finalConfig.initialDelayMs;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if error is retryable
      if (finalConfig.retryableErrors) {
        const isRetryable = finalConfig.retryableErrors.some(
          ErrorClass => lastError instanceof ErrorClass
        );
        if (!isRetryable) {
          throw lastError;
        }
      }

      // Don't retry on last attempt
      if (attempt === finalConfig.maxAttempts) {
        break;
      }

      logError(
        `Attempt ${attempt}/${finalConfig.maxAttempts} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
      );

      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // Increase delay for next attempt
      delayMs = Math.min(
        delayMs * finalConfig.backoffMultiplier,
        finalConfig.maxDelayMs
      );
    }
  }

  throw lastError || new Error('Retry failed without error');
}

/**
 * Safely parse JSON with error handling
 */
export function safeParse<T>(
  json: string,
  fallback: T,
  fieldName: string = 'data'
): T {
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    logError(`Failed to parse ${fieldName}: ${err}`);
    return fallback;
  }
}

/**
 * Validate input parameters
 */
export function validateQueryInput(
  query: string,
  maxLength: number = 1000
): void {
  if (!query || typeof query !== 'string') {
    throw new ValidationError('Query must be a non-empty string');
  }
  if (query.trim().length === 0) {
    throw new ValidationError('Query cannot be empty or whitespace only');
  }
  if (query.length > maxLength) {
    throw new ValidationError(
      `Query too long: ${query.length} characters (max: ${maxLength})`
    );
  }
}

export function validateTopK(topK: number, maxK: number = 100): void {
  if (!Number.isInteger(topK) || topK < 1) {
    throw new ValidationError('topK must be a positive integer');
  }
  if (topK > maxK) {
    throw new ValidationError(`topK too large: ${topK} (max: ${maxK})`);
  }
}

export function validateSimilarityThreshold(threshold: number): void {
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
    throw new ValidationError('Similarity threshold must be between 0 and 1');
  }
}
