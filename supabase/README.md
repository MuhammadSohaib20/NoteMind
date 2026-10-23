# Supabase Database Configuration for NoteMind 🚀

This directory contains production-ready SQL scripts to set up the **NoteMind** database schema, vector search engine, and sample data on [Supabase](https://supabase.com).

---

## 📁 File Directory

| File | Description |
| --- | --- |
| 📄 [`supabase/schema.sql`](schema.sql) | **Primary Schema Setup** (Standalone DB / Node API integration). Includes `pgvector`, tables, HNSW indexes, triggers, RLS, and RPC functions. |
| 📄 [`supabase/schema_supabase_auth.sql`](schema_supabase_auth.sql) | **Supabase Auth Integrated Schema**. Links user profiles to `auth.users` with `auth.uid()` security policies & auto-sync trigger. |
| 📄 [`supabase/seed.sql`](seed.sql) | **Test Seed Data**. Populates initial users, collections, notes, tags, and 768-dim embeddings. |
| 📄 [`supabase/functions.sql`](functions.sql) | **Stored Functions & RAG Utilities**. Contains `match_notes`, statistics, and tag cleanup routines. |

---

## 🚀 How to Apply to Supabase

### Option 1: Via Supabase Web Dashboard (Recommended)

1. Open your project on [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor** tab from the left sidebar.
3. Click **New Query**.
4. Copy the entire contents of [`supabase/schema.sql`](schema.sql) (or [`supabase/schema_supabase_auth.sql`](schema_supabase_auth.sql) if using Supabase Auth).
5. Click **Run**.
6. (Optional) Run [`supabase/seed.sql`](seed.sql) to add initial sample data.

---

### Option 2: Via Supabase CLI

```bash
# Link project
npx supabase link --project-ref <your-project-ref>

# Apply migration / schema
npx supabase db push
```

---

## 🧠 Testing vector RAG similarity search via Supabase Client

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://<project>.supabase.co', '<anon-key>');

// Query vector match function
const { data, error } = await supabase.rpc('match_notes', {
  query_embedding: Array(768).fill(0.05),
  match_threshold: 0.1,
  match_count: 3,
  p_user_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab'
});

console.log('Retrieved Notes:', data);
```
