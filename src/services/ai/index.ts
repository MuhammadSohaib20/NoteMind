import * as crypto from 'crypto';
import { aiConfig, embeddingSupportsTaskType, hasEmbeddingCredentials, hasGenerationCredentials } from '../../config/ai';
import { EmbeddingCache } from './cache';
import { chunkText, TextChunk } from './chunker';
import { GeminiEmbeddingProvider, GeminiGenerationProvider } from './gemini';
import { GroqGenerationProvider } from './groq';
import { EmbedInput, EmbedTask, EmbeddingProvider, GenerationProvider, GenerationRequest } from './types';

export * from './types';
export { chunkText, estimateTokens } from './chunker';
export { l2Normalize } from './gemini';

let embeddingProvider: EmbeddingProvider | null | undefined;
let generationProvider: GenerationProvider | null | undefined;
let cache: EmbeddingCache | undefined;

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
