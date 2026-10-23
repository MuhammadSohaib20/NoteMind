/**
 * Central AI configuration.
 *
 * Every model id lives here (and ultimately in .env) so that upgrading the
 * provider is a configuration change, never a code change. Nothing else in
 * the codebase should reference a hard-coded model string.
 */

function str(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value === null ? fallback : value.trim();
}

function int(key: string, fallback: number): number {
  const parsed = parseInt(str(key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const aiConfig = {
  /** Google AI Studio key. Free tier requires no credit card. */
  geminiApiKey: str('GEMINI_API_KEY'),

  /** Embedding model. Defaults to Gemini Embedding 2 (stable, 768-dim capable). */
  embedModel: str('AI_EMBED_MODEL', 'gemini-embedding-2'),

  /** Generation model used to synthesise the final answer. */
  genModel: str('AI_GEN_MODEL', 'gemini-3.8-flash'),

  /** Cheaper/faster generation model used when the primary one fails. */
  genFallbackModel: str('AI_GEN_FALLBACK_MODEL', 'gemini-3.5-flash-lite'),

  /**
   * Embedding dimensionality. 768 matches the existing `vector(768)` column
   * exactly, so no schema migration is required. Both embedding models are
   * Matryoshka-trained, so 768 / 1536 / 3072 are all valid targets.
   */
  embedDim: int('AI_EMBED_DIM', 768),

  /** Optional Groq key for a second free generation provider. */
  groqApiKey: str('GROQ_API_KEY'),
  groqModel: str('AI_GROQ_MODEL', 'qwen/qwen3.8-27b'),

  /**
   * Requests per minute allowed against the provider. The Gemini free tier
   * sits around 10 RPM for the 3.x Flash models, so we default a little
   * under it and let it be tuned per environment.
   */
  maxRpm: int('AI_MAX_RPM', 10),

  /**
   * Retry attempts for transient provider failures (429 / 5xx / network).
   * Kept low on purpose: the free tier's primary model often reports 503
   * "high demand", and fewer attempts hop to the healthy fallback model in
   * seconds instead of minutes.
   */
  maxAttempts: int('AI_MAX_ATTEMPTS', 3),

  /**
   * Per-request timeout against the provider, in milliseconds. The Gemini SDK
   * has NO client-side timeout by default, so an unresponsive request would
   * hang the RAG endpoint indefinitely. Applies to embeddings.
   */
  timeoutMs: int('AI_TIMEOUT_MS', 30000),

  /**
   * Per-attempt timeout for generation. Long answers on the free tier can
   * legitimately take a minute, so generation gets a more generous budget
   * than the near-instant embedding calls.
   */
  genTimeoutMs: int('AI_GEN_TIMEOUT_MS', 60000),

  /**
   * Hard cap for one /rag/ask generation across the whole provider chain.
   * Past this the controller serves the extractive fallback answer, so the
   * chat can never spin forever.
   */
  genDeadlineMs: int('AI_GEN_DEADLINE_MS', 120000),

  /**
   * Minimum cosine similarity for a chunk to be considered relevant.
   * Gemini embeddings typically score 0.6+ for a related chunk and 0.3-0.45
   * for unrelated text, so 0.25 separates signal from noise without
   * discarding useful matches.
   */
  minSimilarity: Number(str('AI_MIN_SIMILARITY', '0.25')),

  /** Directory used for the on-disk embedding cache. */
  cacheDir: str('AI_CACHE_DIR', '.ai-cache'),

  /**
   * Maximum pages OCR'd per uploaded scanned PDF. OCR is roughly 1-4s per
   * page, so the cap keeps uploads responsive while still covering typical
   * lecture-note documents.
   */
  pdfOcrMaxPages: int('PDF_OCR_MAX_PAGES', 20),

  /**
   * Bound for pdf-parse's text-layer extraction (ms). Normal files are fast
   * (a 300-page, 30MB PDF takes ~7s), but a malformed one can stall the
   * single-threaded server; on timeout the PDF falls through to the OCR path.
   */
  pdfParseTimeoutMs: int('PDF_PARSE_TIMEOUT_MS', 60000),

  /**
   * Total budget (ms) for OCR-ing one scanned PDF. Past this, the pages
   * recognised so far are kept as partial text, so an upload always finishes
   * instead of burning CPU indefinitely.
   */
  pdfOcrDeadlineMs: int('PDF_OCR_DEADLINE_MS', 240000),
} as const;

/** True when an embedding provider can be constructed. */
export function hasEmbeddingCredentials(): boolean {
  return aiConfig.geminiApiKey.length > 0;
}

/** True when a generation provider can be constructed. */
export function hasGenerationCredentials(): boolean {
  return aiConfig.geminiApiKey.length > 0 || aiConfig.groqApiKey.length > 0;
}

/**
 * True when the configured embedding model supports the `taskType` config
 * field. Gemini Embedding 1 does; Embedding 2 replaced it with prompt
 * prefixes, so the provider branches on this.
 */
export function embeddingSupportsTaskType(model: string = aiConfig.embedModel): boolean {
  return /embedding-001|embedding-001$/i.test(model) && !/embedding-2/i.test(model);
}
