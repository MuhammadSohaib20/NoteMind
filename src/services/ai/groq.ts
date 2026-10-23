import { aiConfig } from '../../config/ai';
import { RateLimiter, withRetry } from './http';
import { GenerationProvider, GenerationRequest } from './types';

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
          signal: AbortSignal.timeout(aiConfig.timeoutMs),
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
}
