import { aiConfig } from '../../config/ai';
import { Database, withTransactionOn } from '../../db';
import { embedNote, getEmbeddingProvider, hashContent, vectorToSql } from './index';

export interface EmbeddingSyncResult {
  noteId: string;
  chunks: number;
  model: string;
  dimensions: number;
  skipped: boolean;
  error?: string;
}

/**
 * Replaces every embedding row for a note with freshly computed ones.
 *
 * Notes are the source of truth and embeddings are derived data, so failures
 * are reported rather than thrown: the caller can continue and the backfill
 * script can repair any gaps later.
 */
export async function replaceNoteEmbeddings(
  db: Database,
  noteId: string,
  note: { title: string; content: string; tags?: string[] },
  options: { strict?: boolean } = {}
): Promise<EmbeddingSyncResult> {
  const provider = getEmbeddingProvider();

  if (!provider) {
    return {
      noteId,
      chunks: 0,
      model: aiConfig.embedModel,
      dimensions: aiConfig.embedDim,
      skipped: true,
      error: 'No embedding provider configured',
    };
  }

  try {
    const chunks = await embedNote(note, provider);

    if (chunks.length === 0) {
      await db.query(`DELETE FROM "note_embeddings" WHERE note_id = $1;`, [noteId]);
      return {
        noteId,
        chunks: 0,
        model: provider.model,
        dimensions: provider.dimensions,
        skipped: false,
      };
    }

    // One connection per note: the DELETE and every chunk INSERT either all
    // land or none do, even when several notes are indexed concurrently.
    await withTransactionOn(db, async (client) => {
      await client.query(`DELETE FROM "note_embeddings" WHERE note_id = $1;`, [noteId]);

      for (const chunk of chunks) {
        await client.query(
          `INSERT INTO "note_embeddings"
             (note_id, chunk_content, embedding, embedding_model, embedding_dim, chunk_index, content_hash)
           VALUES ($1, $2, $3::vector, $4, $5, $6, $7);`,
          [
            noteId,
            chunk.content,
            vectorToSql(chunk.vector),
            provider.model,
            provider.dimensions,
            chunk.index,
            hashContent(chunk.content),
          ]
        );
      }
    });

    return {
      noteId,
      chunks: chunks.length,
      model: provider.model,
      dimensions: provider.dimensions,
      skipped: false,
    };
  } catch (error) {
    const message = (error as Error).message;
    if (options.strict) throw error;
    console.warn(`[ai] failed to embed note ${noteId}: ${message}`);
    return {
      noteId,
      chunks: 0,
      model: provider.model,
      dimensions: provider.dimensions,
      skipped: false,
      error: message,
    };
  }
}

/**
 * True when the note already has embeddings produced by the active model and
 * whose content hashes still match, so re-embedding can be skipped.
 */
export async function noteEmbeddingsAreCurrent(
  db: Database,
  noteId: string,
  model: string,
  expectedHashes: string[]
): Promise<boolean> {
  const result = await db.query(
    `SELECT content_hash FROM "note_embeddings" WHERE note_id = $1 AND embedding_model = $2;`,
    [noteId, model]
  );

  const stored = (result.rows as any[]).map((row) => row.content_hash).filter(Boolean);
  if (stored.length !== expectedHashes.length) return false;

  const storedSet = new Set(stored);
  return expectedHashes.every((hash) => storedSet.has(hash));
}
