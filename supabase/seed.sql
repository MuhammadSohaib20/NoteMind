-- ==========================================
-- NoteMind Supabase Seed SQL Script
-- ==========================================

-- Clean Existing Data (Optional - use with care)
TRUNCATE TABLE public.note_embeddings, public.note_tags, public.tags, public.notes, public.collections, public.users CASCADE;

-- 1. Insert Test User
INSERT INTO public.users (id, email, password_hash)
VALUES (
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    'sohaib@notemind.ai',
    '$2b$12$eImiTXuWVxfM37uY4JANjO5E.y5dK.X8x9Q/8L0E9Y6zZ9k1Q2k3y'
);

-- 2. Insert Collections
INSERT INTO public.collections (id, user_id, name)
VALUES 
(
    'c1111111-1111-1111-1111-111111111111',
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    '8-Week Internship Notes'
),
(
    'c2222222-2222-2222-2222-222222222222',
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    'RAG & AI Architecture'
);

-- 3. Insert Tags
INSERT INTO public.tags (id, user_id, name)
VALUES 
(
    't1111111-1111-1111-1111-111111111111',
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    'Prisma'
),
(
    't2222222-2222-2222-2222-222222222222',
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    'PostgreSQL'
),
(
    't3333333-3333-3333-3333-333333333333',
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    'RAG-Pipeline'
);

-- 4. Insert Notes
INSERT INTO public.notes (id, user_id, collection_id, title, content)
VALUES 
(
    'n1111111-1111-1111-1111-111111111111',
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    'c1111111-1111-1111-1111-111111111111',
    'Database Schema Setup with pgvector',
    'Configured PostgreSQL database with pgvector extension to store 768-dim embeddings for NoteMind RAG Q&A system.'
),
(
    'n2222222-2222-2222-2222-222222222222',
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    'c2222222-2222-2222-2222-222222222222',
    'Retrieval Augmented Generation Workflow',
    'User queries are converted into vector embeddings using Ollama/Gemini, followed by cosine similarity search over note_embeddings in Postgres.'
),
(
    'n3333333-3333-3333-3333-333333333333',
    'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab',
    NULL,
    'Quick Scratchpad Note',
    'Standalone unassigned note for testing collection_id nullable constraint.'
);

-- 5. Associate Tags with Notes
INSERT INTO public.note_tags (note_id, tag_id)
VALUES 
('n1111111-1111-1111-1111-111111111111', 't1111111-1111-1111-1111-111111111111'),
('n1111111-1111-1111-1111-111111111111', 't2222222-2222-2222-2222-222222222222'),
('n2222222-2222-2222-2222-222222222222', 't3333333-3333-3333-3333-333333333333');

-- 6. Insert Note Embeddings (768-dimensional zero-padded vectors for testing)
INSERT INTO public.note_embeddings (id, note_id, chunk_content, embedding)
VALUES 
(
    'e1111111-1111-1111-1111-111111111111',
    'n1111111-1111-1111-1111-111111111111',
    'Configured PostgreSQL database with pgvector extension to store 768-dim embeddings for NoteMind RAG Q&A system.',
    ARRAY_FILL(0.05::real, ARRAY[768])::vector
),
(
    'e2222222-2222-2222-2222-222222222222',
    'n2222222-2222-2222-2222-222222222222',
    'User queries are converted into vector embeddings using Ollama/Gemini, followed by cosine similarity search over note_embeddings in Postgres.',
    ARRAY_FILL(0.12::real, ARRAY[768])::vector
);
