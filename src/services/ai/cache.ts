import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EmbedTask } from './types';

/**
 * On-disk cache for embeddings.
 *
 * Embeddings are a pure function of (model, dimensions, task, text), so
 * caching them locally means re-running the backfill script or editing a note
 * costs no provider requests at all. That matters a great deal on a free tier
 * with tight per-minute limits.
 */
export class EmbeddingCache {
  private readonly dir: string;
  private readonly memory = new Map<string, number[]>();
  private readonly enabled: boolean;

  constructor(cacheDir: string, enabled = true) {
    this.enabled = enabled;
    this.dir = path.resolve(cacheDir, 'embeddings');
    if (this.enabled) {
      try {
        fs.mkdirSync(this.dir, { recursive: true });
      } catch {
        // A read-only cache directory must never break the request path.
      }
    }
  }

  private static key(model: string, task: EmbedTask, text: string, dimensions: number): string {
    return crypto
      .createHash('sha256')
      .update(`${model}|${dimensions}|${task}|${text}`)
      .digest('hex');
  }

  private fileFor(key: string): string {
    return path.join(this.dir, key.slice(0, 2), `${key}.json`);
  }

  get(model: string, task: EmbedTask, text: string, dimensions: number): number[] | undefined {
    if (!this.enabled) return undefined;

    const key = EmbeddingCache.key(model, task, text, dimensions);
    const cached = this.memory.get(key);
    if (cached) return cached;

    try {
      const file = this.fileFor(key);
      if (!fs.existsSync(file)) return undefined;

      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(parsed?.v)) return undefined;

      const vector = parsed.v as number[];
      this.memory.set(key, vector);
      return vector;
    } catch {
      return undefined;
    }
  }

  set(model: string, task: EmbedTask, text: string, dimensions: number, vector: number[]): void {
    if (!this.enabled) return;

    const key = EmbeddingCache.key(model, task, text, dimensions);
    this.memory.set(key, vector);

    try {
      const file = this.fileFor(key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ m: model, d: dimensions, t: task, v: vector }));
    } catch {
      // Cache writes are best effort.
    }
  }

  /** Removes every cached vector from memory and from disk. */
  clear(): void {
    this.memory.clear();
    try {
      if (fs.existsSync(this.dir)) {
        fs.rmSync(this.dir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.dir, { recursive: true });
    } catch {
      // Best effort.
    }
  }

  /** Number of vectors currently held in memory. */
  get size(): number {
    return this.memory.size;
  }
}
