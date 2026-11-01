/**
 * Provider-agnostic AI interfaces.
 *
 * The rest of the codebase only ever talks to these interfaces, so the
 * backing vendor can be swapped without touching controllers or services.
 */

export type EmbedTask = 'document' | 'query';

export interface EmbedInput {
  /** The text to embed. */
  text: string;
  /** Optional title, used to enrich document embeddings. */
  title?: string;
}

export interface EmbeddingProvider {
  /** Human readable provider id, persisted alongside each vector. */
  readonly name: string;
  /** Model id. Persisted alongside each vector so we can detect stale rows. */
  readonly model: string;
  /** Dimensionality of the vectors produced. */
  readonly dimensions: number;
  /** Embed a batch of inputs. Returns one vector per input, in order. */
  embed(inputs: EmbedInput[], task: EmbedTask): Promise<number[][]>;
}

export interface GenerationRequest {
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask the provider for a JSON object response. */
  json?: boolean;
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'restart'; reason: string };

export interface GenerationProvider {
  readonly name: string;
  readonly model: string;
  generate(request: GenerationRequest): Promise<string>;
  generateStream?(request: GenerationRequest): AsyncGenerator<StreamEvent>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    readonly status?: number
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
