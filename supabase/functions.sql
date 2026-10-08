-- =========================================================
-- Supabase Stored Functions & Vector Helpers for NoteMind
-- =========================================================

-- 1. Vector Cosine Similarity Search Function
-- Used for Retrieval-Augmented Generation (RAG)
CREATE OR REPLACE FUNCTION public.match_notes(
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
    WHERE (p_user_id IS NULL OR n.user_id = p_user_id)
      AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
    ORDER BY e.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

-- 2. User Knowledge-Base Statistics Function
CREATE OR REPLACE FUNCTION public.get_user_stats(p_user_id uuid)
RETURNS TABLE (
    total_notes bigint,
    total_collections bigint,
    total_tags bigint,
    total_embeddings bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.notes WHERE user_id = p_user_id) AS total_notes,
        (SELECT COUNT(*) FROM public.collections WHERE user_id = p_user_id) AS total_collections,
        (SELECT COUNT(*) FROM public.tags WHERE user_id = p_user_id) AS total_tags,
        (SELECT COUNT(e.id) FROM public.note_embeddings e JOIN public.notes n ON n.id = e.note_id WHERE n.user_id = p_user_id) AS total_embeddings;
END;
$$;

-- 3. Cleanup Unused / Orphaned Tags Function
CREATE OR REPLACE FUNCTION public.delete_unused_tags(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count int;
BEGIN
    WITH unused AS (
        SELECT t.id
        FROM public.tags t
        LEFT JOIN public.note_tags nt ON nt.tag_id = t.id
        WHERE t.user_id = p_user_id AND nt.note_id IS NULL
    )
    DELETE FROM public.tags
    WHERE id IN (SELECT id FROM unused);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
