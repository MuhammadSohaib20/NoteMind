import { GoogleGenAI } from '@google/genai';
import { aiConfig } from '../../config/ai';
import { markGenerationModelUnusable } from './index';
import { withDeadline } from './http';

/**
 * Boot-time verification of the configured model ids.
 *
 * Retired or misspelled model ids otherwise surface only as cryptic 404s the
 * first time a user asks a question. This pings each model once at startup and
 * prints an actionable message, including the exact .env variable to change.
 *
 * Costs one tiny request per configured model per boot, and never throws:
 * a dead model is a configuration problem to report, not a reason to refuse
 * to start the server.
 */
export async function verifyAiConfiguration(): Promise<void> {
  if (!aiConfig.geminiApiKey) {
    // Degraded mode; getEmbeddingProvider() has already warned about this.
    return;
  }

  const client = new GoogleGenAI({ apiKey: aiConfig.geminiApiKey });

  try {
    const response = await client.models.embedContent({
      model: aiConfig.embedModel,
      contents: '.',
      config: { outputDimensionality: Math.min(aiConfig.embedDim, 3072) },
    });

    const returnedDimensions = (response.embeddings?.[0]?.values?.length as number | undefined) ?? 0;
    if (returnedDimensions === aiConfig.embedDim) {
      console.log(`[ai] embedding   OK  ${aiConfig.embedModel} (${returnedDimensions} dims)`);
    } else {
      console.warn(
        `[ai] embedding model "${aiConfig.embedModel}" returned ${returnedDimensions} dims, ` +
          `but AI_EMBED_DIM is ${aiConfig.embedDim}. ` +
          `Set AI_EMBED_DIM=${returnedDimensions} in .env, then run: npm run db:reembed`
      );
    }
  } catch (error) {
    console.warn(`[ai] embedding model "${aiConfig.embedModel}" is NOT usable: ${(error as Error).message}`);
    console.warn(
      `[ai]   -> If it was retired, change AI_EMBED_MODEL in .env, then run: npm run db:reembed`
    );
  }

  for (const model of [aiConfig.genModel, aiConfig.genFallbackModel]) {
    if (!model) continue;

    try {
      // Probe the STREAMING path — that is what /rag/ask/stream uses. A model
      // can answer a plain generateContent yet stall on the stream open, which
      // would cost every ask its full open-timeout. Read one chunk so failures
      // that only surface on the first read are caught here too.
      const stream = await withDeadline(
        client.models.generateContentStream({
          model,
          contents: '.',
          config: { maxOutputTokens: 8 },
        }),
        10_000,
        `generation stream open for "${model}"`
      );
      for await (const _chunk of stream) break;
      console.log(`[ai] generation  OK  ${model} (stream)`);
    } catch (error) {
      // Record it so streaming skips this model instead of stalling the first
      // token for the whole open-timeout. The chain still serves answers via
      // the next model; a restart re-probes (e.g. after a daily quota reset).
      markGenerationModelUnusable(model);
      console.warn(`[ai] generation model "${model}" is NOT usable: ${(error as Error).message}`);
      console.warn(
        `[ai]   -> If it was retired, change AI_GEN_MODEL (or AI_GEN_FALLBACK_MODEL) in .env. ` +
          `Streaming skips it for this run; other chain models keep serving.`
      );
    }
  }
}
