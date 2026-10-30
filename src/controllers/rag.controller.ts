import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db';
import { AuthenticatedRequest, ApiResponse } from '../types';
import {
  embedWithCache,
  getEmbeddingProvider,
  getGenerationProvider,
  vectorToSql,
} from '../services/ai';
import { withDeadline } from '../services/ai/http';
import { aiConfig } from '../config/ai';

export const askRagSchema = z.object({
  body: z.object({
    question: z.string().min(1, 'Question is required'),
    topK: z.number().int().positive().optional().default(3),
    // Optional scope: only search notes inside these collections. Unset or
    // empty means "all indexed notes".
    collectionIds: z.array(z.string().uuid()).max(50).optional(),
    // Optional fine-grained scope: only search these specific notes (the
    // selection ticked in the Ask My Notes "AI Index" panel). Unset or empty
    // means "all indexed notes".
    noteIds: z.array(z.string().uuid()).max(200).optional(),
  }),
});

/** Chunks scoring below this cosine similarity are treated as noise. */
const MIN_SIMILARITY = aiConfig.minSimilarity;

/** Maximum chunks contributed by a single note to the model context. */
const MAX_CHUNKS_PER_NOTE = 2;

interface RetrievedChunk {
  noteId: string;
  title: string;
  content: string;
  chunkContent: string;
  chunkIndex: number;
  collectionName: string;
  tagNames: string;
  similarity: number;
}

interface RetrievedNote {
  id: string;
  title: string;
  content: string;
  collectionName: string;
  tags: string[];
  similarity: number;
  snippet: string;
}

const SYSTEM_INSTRUCTION = [
  "You are NoteMind's assistant. You answer questions using only the user's own notes,",
  'which are supplied as numbered context.',
  '',
  'Answer rules:',
  '- Use ONLY the numbered context. Never use outside knowledge or assumptions.',
  '- Never include citation markers, footnote numbers or [1] / [2]-style references',
  '  anywhere in the answer — the UI displays matched notes separately.',
  '- Attribute claims naturally instead, e.g. "According to your PDC lecture notes ...".',
  '- If the context does not contain the answer, reply exactly: "I couldn\'t find that in your notes."',
  '- Be concise and factual. Never invent names, dates, numbers, or details.',
  '- If the answer spans several notes, combine them.',
  '',
  'Formatting rules (the answer is rendered as styled Markdown, so follow them exactly):',
  '- Write GitHub-flavored Markdown. Start with a one-line intro, then use ## Section',
  '  headings (e.g. ## 📌 Key Points, ## 🧠 Definitions, ## 💡 Worked Example) and',
  '  ### Sub-headings to structure the answer. Never dump plain paragraphs.',
  '- Emphasise key terms with **bold**. Use "-" bullet lists and "1." numbered steps.',
  '- Use Markdown tables for comparisons or enumerations.',
  '- Use "> " quote lines for definitions, formulas, or highlight facts.',
  '- Math must be plain text with Unicode operators only: × ÷ ± ² ³ ≤ ≥ → √ ≈.',
  '  Example: "Total = (4 × 5) + 2 = 22". NEVER use LaTeX, dollar signs, or backslash',
  '  commands (no $...$, \\times, \\frac, ^2 written as superscript markup).',
  '- When the question asks how, why, or about a process, finish with a',
  '  "## 💡 Worked Example" section that solves a concrete example from the notes.',
  '- Always finish with a "## 📚 Sources" section listing every note actually used',
  '  as one "- **<note title>**" line (deduplicated, titles exactly as in context).',
  '- Keep every Markdown marker properly paired; the user must never see raw ** or #.',
].join('\n');

function toPercent(similarity: number): number {
  const clamped = Math.max(0, Math.min(1, similarity));
  return parseFloat((clamped * 100).toFixed(1));
}

function snippet(text: string, length = 320): string {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > length ? `${cleaned.slice(0, length)}...` : cleaned;
}

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((chunk, index) => `[${index + 1}] Title: ${chunk.title}\n${chunk.chunkContent}`)
    .join('\n\n');
}

/**
 * Fallback answer used when no generation provider is configured. It surfaces
 * the retrieved passages verbatim so the endpoint still returns something
 * useful rather than failing.
 */
function buildExtractiveAnswer(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "I couldn't find that in your notes.";
  }

  const passages = chunks
    .map((chunk) => `- **${chunk.title}**: ${snippet(chunk.chunkContent, 400)}`)
    .join('\n');

  return `Here is what your notes say:\n\n${passages}`;
}

/**
 * Legacy keyword-scored search, used only when no embedding provider is
 * configured. Keeps the endpoint working before an API key is added.
 */
async function keywordSearch(
  db: any,
  userId: string,
  question: string,
  topK: number,
  collectionIds: string[] = [],
  noteIds: string[] = []
): Promise<RetrievedNote[]> {
  const params: any[] = [userId];
  let collectionFilter = '';
  if (collectionIds.length > 0) {
    params.push(collectionIds);
    collectionFilter = ` AND c.id = ANY($${params.length}::uuid[])`;
  }
  let noteFilter = '';
  if (noteIds.length > 0) {
    params.push(noteIds);
    noteFilter = ` AND n.id = ANY($${params.length}::uuid[])`;
  }

  const result = await db.query(
    `SELECT n.id, n.title, n.content, c.name as "collectionName",
            COALESCE(string_agg(DISTINCT t.name, ','), '') as "tagNames"
     FROM "notes" n
     LEFT JOIN "collections" c ON c.id = n.collection_id
     LEFT JOIN "note_tags" nt ON nt.note_id = n.id
     LEFT JOIN "tags" t ON t.id = nt.tag_id
     WHERE n.user_id = $1 AND n.deleted_at IS NULL${collectionFilter}${noteFilter}
     GROUP BY n.id, n.title, n.content, c.name;`,
    params
  );

  const qLower = question.toLowerCase();
  const words = qLower
    .replace(/[#,.?!]/g, ' ')
    .split(/\s+/)
    .filter(
      (w: string) =>
        w.length >= 2 &&
        ![
          'the',
          'and',
          'for',
          'with',
          'what',
          'are',
          'summarize',
          'notes',
          'tagged',
          'about',
          'find',
          'from',
        ].includes(w)
    );

  const scored = (result.rows as any[]).map((row) => {
    const tags: string[] = row.tagNames ? row.tagNames.split(',').filter(Boolean) : [];
    const titleLower = (row.title || '').toLowerCase();
    const contentLower = (row.content || '').toLowerCase();
    let bonus = 0;

    for (const tag of tags) {
      if (qLower.includes(tag.toLowerCase())) bonus += 0.45;
    }
    for (const word of words) {
      if (tags.some((tag) => tag.toLowerCase().includes(word))) bonus += 0.25;
      if (titleLower.includes(word)) bonus += 0.2;
      if (contentLower.includes(word)) bonus += 0.1;
    }

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      collectionName: row.collectionName || 'General',
      tags,
      similarity: toPercent(Math.min(0.99, Math.max(0.15, 0.35 + bonus))),
      snippet: snippet(row.content),
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

/**
 * The retrieval pipeline shared by the one-shot (`/rag/ask`) and streaming
 * (`/rag/ask/stream`) endpoints: embed the question, run the vector search,
 * then keep the strongest chunks of each matching note.
 *
 * Returns `mode: 'keyword'` when no embedding provider is configured so the
 * endpoints keep working before an API key is added.
 */
async function retrieve(
  db: any,
  userId: string,
  question: string,
  topK: number,
  collectionIds: string[],
  noteIds: string[]
): Promise<{ mode: 'keyword' | 'vector'; retrievedNotes: RetrievedNote[]; contextChunks: RetrievedChunk[] }> {
  const embeddingProvider = getEmbeddingProvider();

  if (!embeddingProvider) {
    const retrievedNotes = await keywordSearch(db, userId, question, topK, collectionIds, noteIds);
    return { mode: 'keyword', retrievedNotes, contextChunks: [] };
  }

  // 1. Embed the question (asymmetric retrieval: query space).
  const [queryVector] = await embedWithCache([{ text: question }], 'query', embeddingProvider);

  // 2. Vector search. The HNSW index backs the ORDER BY, so this is an
  //    approximate nearest-neighbour lookup rather than a full scan.
  const fetchCount = Math.min(30, Math.max(topK * 4, topK));
  const searchParams: any[] = [vectorToSql(queryVector), userId, embeddingProvider.model, fetchCount];
  let collectionFilter = '';
  if (collectionIds.length > 0) {
    searchParams.push(collectionIds);
    collectionFilter = ` AND c.id = ANY($${searchParams.length}::uuid[])`;
  }
  let noteFilter = '';
  if (noteIds.length > 0) {
    searchParams.push(noteIds);
    noteFilter = ` AND n.id = ANY($${searchParams.length}::uuid[])`;
  }
  const searchResult = await db.query(
    `SELECT e.note_id as "noteId",
            e.chunk_content as "chunkContent",
            e.chunk_index as "chunkIndex",
            n.title,
            n.content,
            c.name as "collectionName",
            COALESCE((
              SELECT string_agg(DISTINCT tg.name, ',')
              FROM "note_tags" nt
              JOIN "tags" tg ON tg.id = nt.tag_id
              WHERE nt.note_id = n.id
            ), '') as "tagNames",
            (1 - (e.embedding <=> $1::vector)) as similarity
     FROM "note_embeddings" e
     JOIN "notes" n ON n.id = e.note_id
     LEFT JOIN "collections" c ON c.id = n.collection_id
     WHERE n.user_id = $2
       AND n.deleted_at IS NULL
       AND e.embedding_model = $3${collectionFilter}${noteFilter}
     ORDER BY e.embedding <=> $1::vector
     LIMIT $4;`,
    searchParams
  );

  const rawChunks = (searchResult.rows as any[])
    .map((row) => ({
      noteId: row.noteId,
      title: row.title,
      content: row.content,
      chunkContent: row.chunkContent || row.content || '',
      chunkIndex: row.chunkIndex ?? 0,
      collectionName: row.collectionName || 'General',
      tagNames: row.tagNames || '',
      similarity: parseFloat(row.similarity ?? '0'),
    }))
    .filter((chunk) => chunk.similarity >= MIN_SIMILARITY);

  // 3. Group chunks by note, keeping the strongest chunks of each note.
  const grouped = new Map<string, { chunk: RetrievedChunk; extras: RetrievedChunk[] }>();
  for (const chunk of rawChunks) {
    const existing = grouped.get(chunk.noteId);
    if (!existing) {
      grouped.set(chunk.noteId, { chunk, extras: [] });
    } else {
      existing.extras.push(chunk);
    }
  }

  const orderedNotes = Array.from(grouped.values())
    .map((entry) => ({
      best: entry.chunk,
      chunks: [entry.chunk, ...entry.extras]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, MAX_CHUNKS_PER_NOTE),
    }))
    .sort((a, b) => b.best.similarity - a.best.similarity)
    .slice(0, topK);

  const contextChunks = orderedNotes.flatMap((entry) => entry.chunks);

  const retrievedNotes: RetrievedNote[] = orderedNotes.map((entry) => ({
    id: entry.best.noteId,
    title: entry.best.title,
    content: entry.best.content,
    collectionName: entry.best.collectionName,
    tags: entry.best.tagNames ? entry.best.tagNames.split(',').filter(Boolean) : [],
    similarity: toPercent(entry.best.similarity),
    snippet: snippet(entry.best.chunkContent),
  }));

  return { mode: 'vector', retrievedNotes, contextChunks };
}

export async function askNotes(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { question, topK = 3 } = req.body;
    const collectionIds: string[] = Array.isArray(req.body.collectionIds)
      ? req.body.collectionIds.filter(Boolean)
      : [];
    const noteIds: string[] = Array.isArray(req.body.noteIds)
      ? req.body.noteIds.filter(Boolean)
      : [];
    const db = await getDatabase();

    const retrieval = await retrieve(db, userId, question, topK, collectionIds, noteIds);

    if (retrieval.mode === 'keyword') {
      // Keyword fallback (no embedding provider configured): one extractive
      // answer so the endpoint still works before an API key is added.
      const { retrievedNotes } = retrieval;
      const answer = buildKeywordAnswer(retrievedNotes);

      return res.status(200).json({
        success: true,
        data: {
          question,
          answer,
          retrievedNotes,
          sources: [],
          degraded: true,
        },
      });
    }

    const { contextChunks, retrievedNotes } = retrieval;

    // 4. Synthesise the answer from the retrieved context.
    let answer: string;
    let degraded = false;

    if (contextChunks.length === 0) {
      answer = "I couldn't find that in your notes.";
    } else {
      const generationProvider = getGenerationProvider();

      if (!generationProvider) {
        answer = buildExtractiveAnswer(contextChunks);
        degraded = true;
      } else {
        try {
          // Hard deadline: past it the extractive fallback below answers from
          // the retrieved chunks, so the chat never spins forever even when
          // every provider is slow or overloaded.
          answer = await withDeadline(
            generationProvider.generate({
              systemInstruction: SYSTEM_INSTRUCTION,
              prompt: `Context:\n\n${buildContext(contextChunks)}\n\nQuestion: ${question}`,
              temperature: 0.2,
              maxOutputTokens: 4096,
            }),
            aiConfig.genDeadlineMs,
            'generation'
          );
        } catch (error) {
          console.error('[rag] generation failed, using extractive fallback:', (error as Error).message);
          answer = buildExtractiveAnswer(contextChunks);
          degraded = true;
        }
      }
    }

    const sources = contextChunks.map((chunk, index) => ({
      index: index + 1,
      noteId: chunk.noteId,
      title: chunk.title,
      collectionName: chunk.collectionName,
      similarity: toPercent(chunk.similarity),
      chunkContent: chunk.chunkContent,
    }));

    return res.status(200).json({
      success: true,
      data: {
        question,
        answer,
        retrievedNotes,
        sources,
        degraded,
      },
    });
  } catch (error) {
    next(error);
  }
}

/** One cited passage in the `sources` array of an answer. */
interface AnswerSource {
  index: number;
  noteId: string;
  title: string;
  collectionName: string;
  similarity: number;
  chunkContent: string;
}

/** Build the plain-language answer used in keyword-fallback mode. */
function buildKeywordAnswer(retrievedNotes: RetrievedNote[]): string {
  if (retrievedNotes.length === 0) {
    return 'No relevant notes found in your knowledge base.';
  }
  return (
    `Based on your notes (${retrievedNotes.map((note) => `"${note.title}"`).join(', ')}):\n\n` +
    retrievedNotes.map((note) => `• ${note.title}: ${snippet(note.content, 300)}`).join('\n\n')
  );
}

/**
 * Streaming variant of `askNotes`.
 *
 * The same retrieval pipeline runs first; the answer is then forwarded over
 * Server-Sent Events as the provider produces it, so the Ask screen shows the
 * answer typing itself instead of waiting for one whole response.
 *
 * SSE frames (each is `event: <name>` + `data: <json>`, blank-line separated):
 *   meta    { question, retrievedNotes, sources }  — retrieval finished
 *   delta   { text }                               — append to the transcript
 *   restart { reason }                             — discard partial text
 *   done    { question, answer, retrievedNotes, sources, degraded }
 *
 * The reliability guarantees of the one-shot endpoint are preserved: the
 * provider chain fails over (mid-answer failures emit `restart`), the whole
 * chain is capped by AI_GEN_DEADLINE_MS, and when no answer arrives at all
 * the extractive fallback replies from the retrieved chunks.
 */
export async function askRagStream(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user!.id;
  const { question, topK = 3 } = req.body;
  const collectionIds: string[] = Array.isArray(req.body.collectionIds)
    ? req.body.collectionIds.filter(Boolean)
    : [];
  const noteIds: string[] = Array.isArray(req.body.noteIds)
    ? req.body.noteIds.filter(Boolean)
    : [];

  // Headers go out first: everything after this writes SSE frames, so a
  // thrown error can no longer become a JSON response.
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Proxies must stream frames immediately instead of buffering the body.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // The user may close the tab mid-answer; stop generating right away.
  let clientGone = false;
  req.on('close', () => {
    clientGone = true;
  });

  try {
    const db = await getDatabase();
    const retrieval = await retrieve(db, userId, question, topK, collectionIds, noteIds);

    const finish = (
      answer: string,
      retrievedNotes: RetrievedNote[],
      sources: AnswerSource[],
      degraded: boolean
    ) => {
      send('done', { question, answer, retrievedNotes, sources, degraded });
      res.end();
    };

    if (retrieval.mode === 'keyword') {
      send('meta', { question, retrievedNotes: retrieval.retrievedNotes, sources: [] });
      return finish(buildKeywordAnswer(retrieval.retrievedNotes), retrieval.retrievedNotes, [], true);
    }

    const { contextChunks, retrievedNotes } = retrieval;
    const sources: AnswerSource[] = contextChunks.map((chunk, index) => ({
      index: index + 1,
      noteId: chunk.noteId,
      title: chunk.title,
      collectionName: chunk.collectionName,
      similarity: toPercent(chunk.similarity),
      chunkContent: chunk.chunkContent,
    }));

    // Matched notes + sources are known before generation, so the UI can
    // show them while the answer is still streaming.
    send('meta', { question, retrievedNotes, sources });

    if (contextChunks.length === 0) {
      return finish("I couldn't find that in your notes.", retrievedNotes, sources, false);
    }

    const generationProvider = getGenerationProvider();
    if (!generationProvider) {
      return finish(buildExtractiveAnswer(contextChunks), retrievedNotes, sources, true);
    }

    let answer = '';
    let degraded = false;
    // Hard cap across the whole provider chain; a slow free-tier model must
    // never leave the connection open forever.
    const deadline = Date.now() + aiConfig.genDeadlineMs;
    const iterator = generationProvider.generateStream!({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: `Context:\n\n${buildContext(contextChunks)}\n\nQuestion: ${question}`,
      temperature: 0.2,
      maxOutputTokens: 4096,
    });

    try {
      while (!clientGone) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          console.warn('[rag] streamed generation hit the deadline; finalising what arrived');
          degraded = true;
          break;
        }
        // Each individual wait is bounded by whatever is left of the budget.
        const step = await withDeadline(iterator.next(), remaining, 'generation');
        if (step.done) break;

        const event = step.value;
        if (event.type === 'delta') {
          answer += event.text;
          send('delta', { text: event.text });
        } else if (event.type === 'restart') {
          // A provider died mid-answer; the fallback model restarts it.
          answer = '';
          send('restart', { reason: event.reason });
        }
      }
    } catch (error) {
      console.error('[rag] streamed generation failed:', (error as Error).message);
      degraded = true;
    } finally {
      // Close the provider stream even when stopping early (deadline or the
      // client disconnected) so the upstream request is released.
      try {
        await iterator.return?.(undefined as never);
      } catch {
        /* ignore */
      }
    }

    if (answer.trim().length === 0) {
      // Nothing usable arrived: the extractive fallback still answers from
      // the retrieved chunks, so the chat never shows an empty bubble.
      answer = buildExtractiveAnswer(contextChunks);
      degraded = true;
    }

    return finish(answer, retrievedNotes, sources, degraded);
  } catch (error) {
    // The SSE stream is already open, so failures are reported as a final
    // frame instead of an HTTP error.
    console.error('[rag] streaming endpoint failed:', (error as Error).message);
    try {
      send('done', {
        question,
        answer: 'Something went wrong while generating the answer. Please try again.',
        retrievedNotes: [],
        sources: [],
        degraded: true,
      });
      res.end();
    } catch {
      res.end();
    }
  }
}
