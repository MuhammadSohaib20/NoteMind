-- =======================================================
-- NoteMind Database Schema (Supabase Auth Integrated)
-- Uses auth.users with RLS policies tied to auth.uid()
-- =======================================================

-- 1. Enable Extensions
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

-- 3. Create Public User Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Automatic Profile Sync Trigger from Supabase Auth (auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Table: collections
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name VARCHAR(255) NOT NULL,
    color_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS color_index INTEGER;
WITH ranked_collections AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) - 1 AS color_index
    FROM public.collections
)
UPDATE public.collections AS collection
SET color_index = ranked_collections.color_index
FROM ranked_collections
WHERE collection.id = ranked_collections.id AND collection.color_index IS NULL;
ALTER TABLE public.collections ALTER COLUMN color_index SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS collections_user_id_color_index_key
    ON public.collections(user_id, color_index);

-- Table: notes
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL ON UPDATE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(100),
    file_data TEXT,
    file_preview TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS file_preview TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS file_data TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Table: tags
CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name)
);

-- Table: note_tags
CREATE TABLE IF NOT EXISTS public.note_tags (
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- Table: note_embeddings
CREATE TABLE IF NOT EXISTS public.note_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    chunk_content TEXT,
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Indexes & HNSW Vector Index

CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_collection_id ON public.notes(collection_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_user_id_deleted_at ON public.notes(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);
CREATE INDEX IF NOT EXISTS idx_note_embeddings_note_id ON public.note_embeddings(note_id);

CREATE INDEX IF NOT EXISTS idx_note_embeddings_hnsw 
ON public.note_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- 5. Updated_at Triggers

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_collections_updated_at BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Row Level Security Policies (auth.uid())

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_embeddings ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view and update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Collections: User scoped CRUD
CREATE POLICY "User collections access" ON public.collections FOR ALL USING (auth.uid() = user_id);

-- Notes: User scoped CRUD
CREATE POLICY "User notes access" ON public.notes FOR ALL USING (auth.uid() = user_id);

-- Tags: User scoped CRUD
CREATE POLICY "User tags access" ON public.tags FOR ALL USING (auth.uid() = user_id);

-- Note Tags: Access allowed if note belongs to user
CREATE POLICY "User note_tags access" ON public.note_tags FOR ALL USING (
    EXISTS (SELECT 1 FROM public.notes WHERE id = note_id AND user_id = auth.uid())
);

-- Note Embeddings: Access allowed if note belongs to user
CREATE POLICY "User note_embeddings access" ON public.note_embeddings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.notes WHERE id = note_id AND user_id = auth.uid())
);

-- 7. RAG Search RPC Function for Supabase Auth

CREATE OR REPLACE FUNCTION match_user_notes(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.0,
    match_count int DEFAULT 5
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
SECURITY DEFINER
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
    WHERE n.user_id = auth.uid()
      AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
    ORDER BY e.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;
