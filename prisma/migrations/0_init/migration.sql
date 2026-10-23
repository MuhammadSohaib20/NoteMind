-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create Table users
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Create Table collections
CREATE TABLE IF NOT EXISTS "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);


-- Create Table notes
CREATE TABLE IF NOT EXISTS "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "collection_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "file_name" VARCHAR(255),
    "file_type" VARCHAR(100),
    "file_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "file_name" VARCHAR(255);
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "file_type" VARCHAR(100);
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "file_data" TEXT;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "file_preview" TEXT;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Create Table tags
CREATE TABLE IF NOT EXISTS "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- Create Table note_tags
CREATE TABLE IF NOT EXISTS "note_tags" (
    "note_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "note_tags_pkey" PRIMARY KEY ("note_id","tag_id")
);

-- Create Table note_embeddings
CREATE TABLE IF NOT EXISTS "note_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "note_id" UUID NOT NULL,
    "chunk_content" TEXT,
    "embedding" vector(768),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_embeddings_pkey" PRIMARY KEY ("id")
);

-- Create Unique & Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE INDEX IF NOT EXISTS "collections_user_id_idx" ON "collections"("user_id");

CREATE INDEX IF NOT EXISTS "notes_user_id_idx" ON "notes"("user_id");
CREATE INDEX IF NOT EXISTS "notes_collection_id_idx" ON "notes"("collection_id");
CREATE INDEX IF NOT EXISTS "notes_created_at_idx" ON "notes"("created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "tags_user_id_name_key" ON "tags"("user_id", "name");
CREATE INDEX IF NOT EXISTS "tags_user_id_idx" ON "tags"("user_id");

CREATE INDEX IF NOT EXISTS "note_embeddings_note_id_idx" ON "note_embeddings"("note_id");

-- HNSW Vector Index for Cosine Similarity Search
CREATE INDEX IF NOT EXISTS "note_embeddings_embedding_hnsw_idx" ON "note_embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- Add Foreign Key Constraints (Idempotent block)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'collections_user_id_fkey') THEN
        ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'notes_user_id_fkey') THEN
        ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'notes_collection_id_fkey') THEN
        ALTER TABLE "notes" ADD CONSTRAINT "notes_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tags_user_id_fkey') THEN
        ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'note_tags_note_id_fkey') THEN
        ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'note_tags_tag_id_fkey') THEN
        ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'note_embeddings_note_id_fkey') THEN
        ALTER TABLE "note_embeddings" ADD CONSTRAINT "note_embeddings_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
