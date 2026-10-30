import { aiConfig } from '../../config/ai';
import { RateLimiter, withRetry } from './http';
import { GenerationProvider, GenerationRequest, StreamEvent } from './types';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Optional second generation provider.
 *
 * Groq exposes an OpenAI-compatible chat completions API and runs a free
 * tier with a separate request budget. It is used as a fallback when the
 * primary provider is rate limited or unavailable, and for background jobs
 * where a cheaper/faster model is preferable.
 */
export class GroqGenerationProvider implements GenerationProvider {
  readonly name = 'groq';
  readonly model: string;

  private readonly apiKey: string;
  private readonly limiter: RateLimiter;

  constructor(options: { apiKey: string; model?: string; maxRpm?: number }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? aiConfig.groqModel;
    this.limiter = new RateLimiter(options.maxRpm ?? aiConfig.maxRpm);
  }

  async generate(request: GenerationRequest): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }
    messages.push({ role: 'user', content: request.prompt });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxOutputTokens ?? 2048,
    };

    if (request.json) {
      body.response_format = { type: 'json_object' };
    }

    const response = await withRetry(
      async () => {
        await this.limiter.acquire();

        const httpResponse = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          // fetch() waits forever without one; never leave a request unbounded.
          // Generation gets the longer per-attempt budget (free-tier answers
          // can legitimately take a minute).
          signal: AbortSignal.timeout(aiConfig.genTimeoutMs),
        });

        if (!httpResponse.ok) {
          const errorText = await httpResponse.text().catch(() => '');
          const error: any = new Error(
            `Groq request failed (${httpResponse.status}): ${errorText.slice(0, 300)}`
          );
          error.status = httpResponse.status;
          error.headers = Object.fromEntries(httpResponse.headers.entries());
          throw error;
        }

        return (await httpResponse.json()) as any;
      },
      {
        attempts: aiConfig.maxAttempts,
        label: 'groq.chat.completions',
      }
    );

    const text = response?.choices?.[0]?.message?.content;
    if (!text || text.trim().length === 0) {
      throw new Error('Groq returned an empty response');
    }
    return text.trim();
  }

  /**
   * Streams via the OpenAI-compatible `stream: true` mode. The response body
   * is a Server-Sent Events stream which is parsed line by line so text is
   * forwarded the moment it is produced.
   */
  async *generateStream(request: GenerationRequest): AsyncGenerator<StreamEvent> {
    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }
    messages.push({ role: 'user', content: request.prompt });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxOutputTokens ?? 2048,
      stream: true,
    };

    if (request.json) {
      body.response_format = { type: 'json_object' };
    }

    await this.limiter.acquire();
    const httpResponse = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Bounds opening the stream AND the time until the last chunk; free
      // tiers occasionally stall a connection forever.
      signal: AbortSignal.timeout(aiConfig.genTimeoutMs),
    });

    if (!httpResponse.ok || !httpResponse.body) {
      const errorText = await httpResponse.text().catch(() => '');
      const error: any = new Error(
        `Groq request failed (${httpResponse.status}): ${errorText.slice(0, 300)}`
      );
      error.status = httpResponse.status;
      throw error;
    }

    const reader = httpResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let emitted = false;
    let streamEnded = false;

    while (!streamEnded) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineAt: number;
      while ((newlineAt = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineAt).trim();
        buffer = buffer.slice(newlineAt + 1);
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          streamEnded = true;
          break;
        }

        try {
          const parsed = JSON.parse(payload);
          const text = parsed?.choices?.[0]?.delta?.content;
          if (text) {
            emitted = true;
            yield { type: 'delta', text };
          }
        } catch {
          // Ignore a malformed frame; the stream continues.
        }
      }
    }

    if (!emitted) {
      throw new Error('Groq returned an empty streamed response');
    }
  }
}
