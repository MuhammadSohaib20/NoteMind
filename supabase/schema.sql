-- ==========================================
-- NoteMind Database Schema for Supabase
-- Extensions: pgvector (768-dim embeddings)
-- ==========================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;

-- 2. Create Updated At Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Tables

-- Table: users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: collections
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: notes
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL ON UPDATE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: tags
CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name)
);

-- Table: note_tags (Junction Table)
CREATE TABLE IF NOT EXISTS public.note_tags (
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- Table: note_embeddings (768-dim Vector Embeddings for RAG)
CREATE TABLE IF NOT EXISTS public.note_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    chunk_content TEXT,
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Indexes for Performance Optimization

CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_collection_id ON public.notes(collection_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);
CREATE INDEX IF NOT EXISTS idx_note_embeddings_note_id ON public.note_embeddings(note_id);

-- HNSW Vector Index for Fast Cosine Similarity Search
CREATE INDEX IF NOT EXISTS idx_note_embeddings_hnsw 
ON public.note_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- 5. Attach Auto-Updated At Triggers

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_collections_updated_at ON public.collections;
CREATE TRIGGER set_collections_updated_at
BEFORE UPDATE ON public.collections
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_notes_updated_at ON public.notes;
CREATE TRIGGER set_notes_updated_at
BEFORE UPDATE ON public.notes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_tags_updated_at ON public.tags;
CREATE TRIGGER set_tags_updated_at
BEFORE UPDATE ON public.tags
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Vector Similarity Search Function (Supabase RPC)

CREATE OR REPLACE FUNCTION match_notes(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.0,
    match_count int DEFAULT 5,
    p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    note_id uuid,
    title varchar,
    content text,
    chunk_content text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        n.id AS note_id,
        n.title,
        n.content,
        e.chunk_content,
        (1 - (e.embedding <=> query_embedding)) AS similarity
    FROM public.note_embeddings e
    JOIN public.notes n ON n.id = e.note_id
    WHERE (p_user_id IS NULL OR n.user_id = p_user_id)
      AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
    ORDER BY e.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

-- 7. Enable Supabase Row Level Security (RLS) & Policies

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_embeddings ENABLE ROW LEVEL SECURITY;

-- Allow full access for backend service role key
CREATE POLICY "Service Role full access on users" ON public.users FOR ALL USING (true);
CREATE POLICY "Service Role full access on collections" ON public.collections FOR ALL USING (true);
CREATE POLICY "Service Role full access on notes" ON public.notes FOR ALL USING (true);
CREATE POLICY "Service Role full access on tags" ON public.tags FOR ALL USING (true);
CREATE POLICY "Service Role full access on note_tags" ON public.note_tags FOR ALL USING (true);
CREATE POLICY "Service Role full access on note_embeddings" ON public.note_embeddings FOR ALL USING (true);
