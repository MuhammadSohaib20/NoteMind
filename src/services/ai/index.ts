import * as crypto from 'crypto';
import { aiConfig, embeddingSupportsTaskType, hasEmbeddingCredentials, hasGenerationCredentials } from '../../config/ai';
import { EmbeddingCache } from './cache';
import { chunkText, TextChunk } from './chunker';
import { GeminiEmbeddingProvider, GeminiGenerationProvider } from './gemini';
import { GroqGenerationProvider } from './groq';
import { EmbedInput, EmbedTask, EmbeddingProvider, GenerationProvider, GenerationRequest, StreamEvent } from './types';

export * from './types';
export { chunkText, estimateTokens } from './chunker';
export { l2Normalize } from './gemini';

let embeddingProvider: EmbeddingProvider | null | undefined;
let generationProvider: GenerationProvider | null | undefined;
let cache: EmbeddingCache | undefined;

/**
 * Models the boot healthcheck found unusable (retired id, exhausted quota, ...).
 * Streaming skips them so a known-bad model cannot stall the first token —
 * trying one again would only burn the open-timeout before failing over anyway.
 * Cleared only by a restart (the healthcheck re-probes every boot).
 */
const unusableGenerationModels = new Set<string>();

export function markGenerationModelUnusable(model: string): void {
  if (model) unusableGenerationModels.add(model);
}

/**
 * Overrides the active providers. Used by tests to exercise the retrieval
 * pipeline without calling a real provider.
 */
export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  embeddingProvider = provider;
}

export function setGenerationProvider(provider: GenerationProvider | null): void {
  generationProvider = provider;
}

function getCache(): EmbeddingCache {
  if (!cache) {
    cache = new EmbeddingCache(aiConfig.cacheDir);
  }
  return cache;
}

/** Returns the configured embedding provider, or null when unconfigured. */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (embeddingProvider !== undefined) return embeddingProvider;

  if (!hasEmbeddingCredentials()) {
    console.warn(
      '[ai] GEMINI_API_KEY is not set - embeddings are disabled. ' +
        'Get a free key at https://aistudio.google.com/apikey (no credit card required).'
    );
    embeddingProvider = null;
    return embeddingProvider;
  }

  embeddingProvider = new GeminiEmbeddingProvider({
    apiKey: aiConfig.geminiApiKey,
    model: aiConfig.embedModel,
    dimensions: aiConfig.embedDim,
    useTaskType: embeddingSupportsTaskType(),
  });

  return embeddingProvider;
}

/**
 * Generation provider with an automatic fallback chain:
 * primary model -> cheaper Gemini model -> Groq (if configured).
 */
class ResilientGenerationProvider implements GenerationProvider {
  readonly name = 'resilient';
  readonly model: string;

  constructor(private readonly chain: GenerationProvider[]) {
    this.model = chain[0]?.model ?? 'none';
  }

  async generate(request: GenerationRequest): Promise<string> {
    let lastError: unknown;

    for (let i = 0; i < this.chain.length; i++) {
      const provider = this.chain[i];
      try {
        return await provider.generate(request);
      } catch (error) {
        lastError = error;
        console.warn(
          `[ai] generation provider "${provider.name}" (${provider.model}) failed: ` +
            `${(error as Error).message}`
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('All generation providers failed');
  }

  /**
   * Streams through the same chain. Failover semantics:
   * - A provider that dies BEFORE its first token is skipped silently.
   * - A provider that dies MID-answer already put text on the wire, so a
   *   `restart` event is yielded first — clients discard the partial answer
   *   and the next provider streams a fresh one.
   */
  async *generateStream(request: GenerationRequest): AsyncGenerator<StreamEvent> {
    let lastError: unknown;

    for (const provider of this.chain) {
      // Skip models already flagged unusable (by the boot healthcheck or by an
      // earlier stall in this run): trying one would only delay the first
      // token before failing over anyway.
      if (unusableGenerationModels.has(provider.model)) {
        console.warn(
          `[ai] skipping "${provider.name}" (${provider.model}): flagged unusable this run`
        );
        continue;
      }
      let emittedAnything = false;
      const startedAt = Date.now();
      try {
        const stream = provider.generateStream
          ? provider.generateStream(request)
          : singleDeltaStream(provider, request);

        for await (const event of stream) {
          if (event.type === 'delta') emittedAnything = true;
          yield event;
        }
        return;
      } catch (error) {
        lastError = error;
        console.warn(
          `[ai] streamed generation via "${provider.name}" (${provider.model}) failed: ` +
            `${(error as Error).message}`
        );
        if (emittedAnything) {
          yield { type: 'restart', reason: provider.name };
        } else {
          const burnedMs = Date.now() - startedAt;
          // A pre-token failure that burned real waiting time is a stall, not
          // a transient blip: skip this model for the rest of the run so every
          // later ask does not pay the wait again. Fast failures (<5s) are
          // left alone — they may be transient and cost almost nothing.
          if (burnedMs >= 5000) {
            markGenerationModelUnusable(provider.model);
            console.warn(
              `[ai] "${provider.model}" stalled ${burnedMs}ms before the first token; ` +
                `skipping it for the rest of this run`
            );
          }
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('All generation providers failed');
  }
}

/** Wraps a non-streaming provider as a single-delta stream. */
async function* singleDeltaStream(
  provider: GenerationProvider,
  request: GenerationRequest
): AsyncGenerator<StreamEvent> {
  yield { type: 'delta', text: await provider.generate(request) };
}

/** Returns the configured generation provider, or null when unconfigured. */
export function getGenerationProvider(): GenerationProvider | null {
  if (generationProvider !== undefined) return generationProvider;

  if (!hasGenerationCredentials()) {
    console.warn('[ai] No generation credentials configured - RAG answers will use the extractive fallback.');
    generationProvider = null;
    return generationProvider;
  }

  const chain: GenerationProvider[] = [];

  if (aiConfig.geminiApiKey) {
    chain.push(
      new GeminiGenerationProvider({
        apiKey: aiConfig.geminiApiKey,
        model: aiConfig.genModel,
      })
    );

    if (aiConfig.genFallbackModel && aiConfig.genFallbackModel !== aiConfig.genModel) {
      chain.push(
        new GeminiGenerationProvider({
          apiKey: aiConfig.geminiApiKey,
          model: aiConfig.genFallbackModel,
        })
      );
    }
  }

  if (aiConfig.groqApiKey) {
    chain.push(
      new GroqGenerationProvider({
        apiKey: aiConfig.groqApiKey,
        model: aiConfig.groqModel,
      })
    );
  }

  generationProvider = new ResilientGenerationProvider(chain);
  return generationProvider;
}

/**
 * Embeds a batch of inputs, serving from the local cache where possible so
 * unchanged content never consumes provider quota.
 */
export async function embedWithCache(
  inputs: EmbedInput[],
  task: EmbedTask,
  provider: EmbeddingProvider = getEmbeddingProvider() as EmbeddingProvider
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const store = getCache();
  const results: number[][] = new Array(inputs.length);
  const pending: number[] = [];
  const pendingInputs: EmbedInput[] = [];

  inputs.forEach((input, index) => {
    const cached = store.get(provider.model, task, input.text, provider.dimensions);
    if (cached && cached.length === provider.dimensions) {
      results[index] = cached;
    } else {
      pending.push(index);
      pendingInputs.push(input);
    }
  });

  if (pendingInputs.length > 0) {
    const vectors = await provider.embed(pendingInputs, task);
    pending.forEach((targetIndex, i) => {
      const vector = vectors[i];
      results[targetIndex] = vector;
      store.set(provider.model, task, pendingInputs[i].text, provider.dimensions, vector);
    });
  }

  return results;
}

/** Clears the on-disk embedding cache. */
export function clearEmbeddingCache(): void {
  getCache().clear();
}

export interface NoteChunk {
  index: number;
  content: string;
  vector: number[];
}

/**
 * Chunks a note and embeds every chunk. Title and tags are prepended to the
 * embedded text (but not stored in `chunk_content`, which keeps the stored
 * chunk as the literal source text for display and citation).
 */
export async function embedNote(
  note: { title: string; content: string; tags?: string[] },
  provider: EmbeddingProvider = getEmbeddingProvider() as EmbeddingProvider
): Promise<NoteChunk[]> {
  const chunks = chunkText(note.content);
  if (chunks.length === 0) return [];

  const tagText = (note.tags ?? []).join(' ');
  const inputs: EmbedInput[] = chunks.map((chunk) => ({
    text: tagText ? `${tagText}\n\n${chunk.content}` : chunk.content,
    title: note.title,
  }));

  const vectors = await embedWithCache(inputs, 'document', provider);

  return chunks.map((chunk, index) => ({
    index: chunk.index,
    content: chunk.content,
    vector: vectors[index],
  }));
}

/** Serialises a vector into the `[1,2,3]` literal pgvector expects. */
export function vectorToSql(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/** Content hash used to detect whether a stored embedding is still current. */
export function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
}

export { TextChunk };
