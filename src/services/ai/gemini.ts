import { GoogleGenAI } from '@google/genai';
import { aiConfig } from '../../config/ai';
import { RateLimiter, withRetry, withDeadline } from './http';
import { EmbedInput, EmbedTask, GenerationProvider, GenerationRequest, EmbeddingProvider, StreamEvent } from './types';

const STREAM_OPEN_TIMEOUT_MS = 20000;

/** L2 normalises a vector so cosine distance is computed on direction only. */
export function l2Normalize(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) {
    sumOfSquares += value * value;
  }
  const magnitude = Math.sqrt(sumOfSquares);
  if (!Number.isFinite(magnitude) || magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

/**
 * Embedding 2 replaced the `taskType` config field with task prefixes baked
 * into the prompt. Google documents these exact formats for question
 * answering, which is what this product does.
 */
export function formatQuery(text: string): string {
  return `task: question answering | query: ${text}`;
}

export function formatDocument(text: string, title?: string): string {
  return `title: ${title && title.trim() ? title.trim() : 'none'} | text: ${text}`;
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly model: string;
  readonly dimensions: number;

  private readonly client: GoogleGenAI;
  private readonly limiter: RateLimiter;
  private readonly useTaskType: boolean;
  private readonly httpOptions: Record<string, unknown>;

  constructor(options: {
    apiKey: string;
    model?: string;
    dimensions?: number;
    maxRpm?: number;
    useTaskType?: boolean;
  }) {
    this.model = options.model ?? aiConfig.embedModel;
    this.dimensions = options.dimensions ?? aiConfig.embedDim;
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.limiter = new RateLimiter(options.maxRpm ?? aiConfig.maxRpm);
    this.useTaskType = options.useTaskType ?? false;
    this.httpOptions = { timeout: aiConfig.timeoutMs };
  }

  async embed(inputs: EmbedInput[], task: EmbedTask): Promise<number[][]> {
    if (inputs.length === 0) return [];

    const prepared = inputs.map((input) =>
      task === 'query'
        ? formatQuery(input.text)
        : this.useTaskType
          ? input.text
          : formatDocument(input.text, input.title)
    );

    // The task_type path carries a per-document title, so it cannot be
    // batched into a single request. Everything else uses one batched call.
    if (this.useTaskType) {
      const vectors: number[][] = [];
      for (let i = 0; i < prepared.length; i++) {
        vectors.push(await this.embedSingle(prepared[i], task, inputs[i]));
      }
      return vectors;
    }

    // Each input is wrapped in its own Content object so the model returns
    // one vector per input rather than a single aggregated one.
    const batched = await this.embedBatch(prepared);
    if (batched) return batched;

    // Fall back to one request per input.
    const vectors: number[][] = [];
    for (let i = 0; i < prepared.length; i++) {
      vectors.push(await this.embedSingle(prepared[i], task, inputs[i]));
    }
    return vectors;
  }

  private async embedBatch(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 1) return null;

    try {
      const contents = texts.map((text) => ({ role: 'user', parts: [{ text }] }));

      const response = await this.request(() =>
        this.client.models.embedContent({
          model: this.model,
          contents: contents as any,
          config: {
            outputDimensionality: this.dimensions,
            httpOptions: this.httpOptions,
          },
        })
      );

      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== texts.length) return null;

      return embeddings.map((embedding) => l2Normalize((embedding.values ?? []) as number[]));
    } catch (error) {
      console.warn(
        '[ai] batch embedding unavailable, falling back to sequential requests:',
        (error as Error).message
      );
      return null;
    }
  }

  private async embedSingle(text: string, task: EmbedTask, input: EmbedInput): Promise<number[]> {
    const response = await this.request(() =>
      this.client.models.embedContent({
        model: this.model,
        contents: text,
        config: this.embedConfig(task, [input]),
      })
    );

    const values = response.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error('Embedding provider returned an empty vector');
    }
    return l2Normalize(values as number[]);
  }

  private embedConfig(task: EmbedTask, inputs: EmbedInput[]): Record<string, unknown> {
    const config: Record<string, unknown> = {
      outputDimensionality: this.dimensions,
      // The SDK ships without a client-side timeout, so a hung request would
      // block the caller indefinitely. Enforce one per attempt.
      httpOptions: this.httpOptions,
    };

    if (this.useTaskType) {
      config.taskType = task === 'query' ? 'QUESTION_ANSWERING' : 'RETRIEVAL_DOCUMENT';
      const title = inputs[0]?.title;
      if (task === 'document' && title) {
        config.title = title;
      }
    }

    return config;
  }

  private async request<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(
      async () => {
        await this.limiter.acquire();
        return fn();
      },
      {
        attempts: aiConfig.maxAttempts,
        label: 'gemini.embedContent',
      }
    );
  }
}

export class GeminiGenerationProvider implements GenerationProvider {
  readonly name = 'gemini';
  readonly model: string;

  private readonly client: GoogleGenAI;
  private readonly limiter: RateLimiter;
  private readonly httpOptions: Record<string, unknown>;

  constructor(options: { apiKey: string; model?: string; maxRpm?: number }) {
    this.model = options.model ?? aiConfig.genModel;
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.limiter = new RateLimiter(options.maxRpm ?? aiConfig.maxRpm);
    // Generation uses its own, more generous timeout: a full-length free-tier
    // answer can take a minute, while embeddings are near-instant.
    this.httpOptions = { timeout: aiConfig.genTimeoutMs };
  }

  async generate(request: GenerationRequest): Promise<string> {
    const config: Record<string, unknown> = {
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxOutputTokens ?? 2048,
    };

    if (request.json) {
      config.responseMimeType = 'application/json';
    }

    const response = await withRetry(
      async () => {
        await this.limiter.acquire();
        return this.client.models.generateContent({
          model: this.model,
          contents: request.prompt,
          config: {
            ...config,
            systemInstruction: request.systemInstruction,
            httpOptions: this.httpOptions,
          } as any,
        });
      },
      {
        attempts: aiConfig.maxAttempts,
        label: 'gemini.generateContent',
      }
    );

    const text = response.text;
    if (!text || text.trim().length === 0) {
      throw new Error('Generation provider returned an empty response');
    }
    return text.trim();
  }

  async *generateStream(request: GenerationRequest): AsyncGenerator<StreamEvent> {
    const config: Record<string, unknown> = {
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxOutputTokens ?? 2048,
      systemInstruction: request.systemInstruction,
      httpOptions: this.httpOptions,
    };
    if (request.json) config.responseMimeType = 'application/json';

    await this.limiter.acquire();
    const stream = await withDeadline(
      this.client.models.generateContentStream({
        model: this.model,
        contents: request.prompt,
        config: config as any,
      }),
      STREAM_OPEN_TIMEOUT_MS,
      `gemini stream open (${this.model})`
    );

    let emitted = false;
    for await (const chunk of stream) {
      const text = chunk?.text;
      if (text) {
        emitted = true;
        yield { type: 'delta', text };
      }
    }
    if (!emitted) throw new Error('Generation provider returned an empty streamed response');
  }
}
