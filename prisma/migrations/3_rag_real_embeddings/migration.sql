-- Real semantic embeddings.
--
-- Each vector is tagged with the model that produced it and the chunk index it
-- belongs to. Without this, changing the embedding model would silently mix
-- two incompatible vector spaces in the same index and every search would
-- return nonsense.

ALTER TABLE "note_embeddings" ADD COLUMN IF NOT EXISTS "embedding_model" TEXT;
ALTER TABLE "note_embeddings" ADD COLUMN IF NOT EXISTS "embedding_dim" INTEGER;
ALTER TABLE "note_embeddings" ADD COLUMN IF NOT EXISTS "chunk_index" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "note_embeddings" ADD COLUMN IF NOT EXISTS "content_hash" TEXT;

-- Remove any duplicate (note_id, chunk_index) pairs left behind by the
-- previous one-embedding-per-note behaviour before enforcing uniqueness.
DELETE FROM "note_embeddings" a
USING "note_embeddings" b
WHERE a.id > b.id
  AND a.note_id = b.note_id
  AND a.chunk_index = b.chunk_index;

CREATE UNIQUE INDEX IF NOT EXISTS "note_embeddings_note_chunk_key"
  ON "note_embeddings" ("note_id", "chunk_index");

CREATE INDEX IF NOT EXISTS "note_embeddings_embedding_model_idx"
  ON "note_embeddings" ("embedding_model");

CREATE INDEX IF NOT EXISTS "note_embeddings_content_hash_idx"
  ON "note_embeddings" ("content_hash");
