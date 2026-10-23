import { AiProviderError } from './types';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounds an async operation with a hard deadline. The wrapped promise keeps
 * running after the deadline fires (its settlement is ignored from then on),
 * which is fine for provider calls that are either answered or aborted by
 * their own per-attempt timeouts.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Serialises requests so the provider is never hit faster than the configured
 * requests-per-minute budget. Free tiers are aggressive about this and return
 * 429 rather than queueing.
 */
export class RateLimiter {
  private lastRequestAt = 0;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(requestsPerMinute: number) {
    this.minIntervalMs = requestsPerMinute > 0 ? 60000 / requestsPerMinute : 0;
  }

  async acquire(): Promise<void> {
    if (this.minIntervalMs <= 0) return;

    const turn = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }
      this.lastRequestAt = Date.now();
    });

    // Keep the chain alive even if a turn rejects.
    this.queue = turn.then(
      () => undefined,
      () => undefined
    );

    await turn;
  }
}

/** Extracts an HTTP status code from the many error shapes providers throw. */
export function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as any;
  const status = candidate.status ?? candidate.statusCode ?? candidate.code ?? candidate.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Pulls a Retry-After hint (seconds or HTTP date) from an error, if present. */
function extractRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const headers = (error as any).headers ?? (error as any).response?.headers;
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (raw === undefined) return undefined;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);

  const date = Date.parse(String(raw));
  if (Number.isFinite(date)) {
    return Math.min(Math.max(0, date - Date.now()), 30_000);
  }
  return undefined;
}

export interface RetryOptions {
  attempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * Retries transient provider failures with exponential backoff and jitter.
 * Rate-limit errors honour the server's Retry-After hint when present.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = Math.max(1, options.attempts);
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const label = options.label ? `${options.label}: ` : '';

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = extractStatus(error);
      const retryable = status === undefined ? isNetworkError(error) : isRetryableStatus(status);

      if (!retryable || attempt === attempts - 1) {
        break;
      }

      const retryAfter = status === 429 ? extractRetryAfterMs(error) : undefined;
      const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const delay = retryAfter ?? Math.round(exponential * (0.5 + Math.random() * 0.5));

      options.onRetry?.(attempt + 1, error, delay);
      console.warn(
        `${label}request failed (${status ?? 'network'}), retrying in ${delay}ms ` +
          `[attempt ${attempt + 1}/${attempts}]`
      );

      await sleep(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiProviderError(`${label}provider request failed`, lastError, extractStatus(lastError));
}

function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ENOTFOUND') ||
    message.includes('EAI_AGAIN') ||
    message.includes('socket hang up') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('aborted') ||
    message.includes('timeout')
  );
}
