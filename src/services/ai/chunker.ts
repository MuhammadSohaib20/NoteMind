/**
 * Text chunking for RAG.
 *
 * A note becomes one or more chunks; each chunk is embedded independently so
 * that retrieval returns the relevant *section* of a long note rather than a
 * single diluted centroid of the whole thing.
 */

export interface ChunkOptions {
  /** Maximum characters per chunk. */
  maxChars?: number;
  /** Characters of the previous chunk repeated at the start of the next. */
  overlapChars?: number;
  /** Chunks smaller than this are merged into their neighbour. */
  minChars?: number;
}

export interface TextChunk {
  index: number;
  content: string;
}

const DEFAULT_MAX_CHARS = 1800;
const DEFAULT_OVERLAP_CHARS = 250;
const DEFAULT_MIN_CHARS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Collapses excessive blank lines and trailing whitespace. */
function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits an over-long paragraph into sentence-aligned pieces. */
function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];

  const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
  const pieces: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      pieces.push(current.trim());
      current = '';
    }
    if (sentence.length > maxChars) {
      // A single sentence longer than the limit: hard-split it.
      if (current.trim().length > 0) {
        pieces.push(current.trim());
        current = '';
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        pieces.push(sentence.slice(i, i + maxChars).trim());
      }
      continue;
    }
    current += sentence;
  }

  if (current.trim().length > 0) {
    pieces.push(current.trim());
  }

  return pieces.filter((piece) => piece.length > 0);
}

/**
 * Splits text into overlapping chunks on paragraph boundaries, falling back to
 * sentence boundaries and then hard character splits for pathological input.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChars = Math.max(200, options.maxChars ?? DEFAULT_MAX_CHARS);
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, maxChars - 1));
  const minChars = Math.max(0, options.minChars ?? DEFAULT_MIN_CHARS);

  const normalized = normalize(text);
  if (!normalized) return [];

  if (normalized.length <= maxChars) {
    return [{ index: 0, content: normalized }];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitLongParagraph(paragraph, maxChars));

  const rawChunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      rawChunks.push(current);
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
    } else {
      // The paragraph was already split above, so this branch is defensive.
      current = paragraph.slice(0, maxChars);
    }
  }

  if (current.length > 0) {
    rawChunks.push(current);
  }

  // Merge a trailing chunk that is too small into its predecessor.
  const merged: string[] = [];
  for (const chunk of rawChunks) {
    if (merged.length > 0 && chunk.length < minChars) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${chunk}`;
    } else {
      merged.push(chunk);
    }
  }

  // Apply overlap. The repeated tail consumes the next chunk's budget so the
  // final chunk size never exceeds maxChars.
  const withOverlap: string[] = [];
  for (let i = 0; i < merged.length; i++) {
    if (i === 0 || overlapChars === 0) {
      withOverlap.push(merged[i]);
      continue;
    }

    const previous = merged[i - 1];
    const tail = previous.slice(Math.max(0, previous.length - overlapChars)).trim();

    if (tail.length === 0) {
      withOverlap.push(merged[i]);
      continue;
    }

    const budget = Math.max(0, maxChars - tail.length - 2);
    const body = merged[i].slice(0, budget);
    withOverlap.push(`${tail}\n\n${body}`.trim());
  }

  return withOverlap.map((content, index) => ({ index, content: content.trim() }));
}

/** Rough token estimate (~4 characters per token for English prose). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export { sleep };
