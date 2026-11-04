# NoteMind RAG Pipeline

Semantic search and grounded answers over your notes, powered by Google Gemini.

---

## 1. Quick start

```bash
# 1. Get a free API key (no credit card required)
#    https://aistudio.google.com/apikey

# 2. Add the key to .env
GEMINI_API_KEY=your_key_here

# 3. Regenerate embeddings for existing notes
npm run db:reembed -- --dry-run     # preview
npm run db:reembed                  # actually do it

# 4. Run
npm run dev
```

---

## 2. Models

| Role | Model | Notes |
|---|---|---|
| Embedding | `gemini-embedding-2` | Stable. Outputs 768 dims, matching the existing `vector(768)` column. Multimodal (text/image/audio/video). |
| Generation | `gemini-3.8-flash` | Stable. 1,048,576 input / 65,536 output tokens. Structured outputs and thinking supported. |
| Generation fallback | `gemini-3.5-flash-lite` | Used automatically if the primary model fails or is rate limited. |
| Generation fallback (optional) | Groq `qwen/qwen3.8-27b` | Set `GROQ_API_KEY` to enable a second provider with its own free-tier budget. |

### Cost

The Google AI Studio **Free tier requires no credit card** and covers both models
at no charge. Paid pricing (if you ever link a billing account) is
`$0.20 / 1M` embedding tokens and `$0.75 / 1M` input + `$3.75 / 1M` output
tokens for `gemini-3.8-flash` — roughly **$0.003 per RAG question**.

Free tier caveats:
- Tight rate limits (~10 RPM). Handled by the request pacer in
  `src/services/ai/http.ts`.
- Prompts and responses **may be used to improve Google products**. Link a
  billing account to opt out.
- Free-tier models can be restricted with little notice. If that happens,
  point `AI_EMBED_MODEL` / `AI_GEN_MODEL` at a different id — no code change.

### Changing models

Every model id lives in `.env`. Changing them is a configuration change:

```bash
AI_EMBED_MODEL="gemini-embedding-2"
AI_GEN_MODEL="gemini-3.8-flash"
AI_EMBED_DIM=768
```

After changing the **embedding** model, run `npm run db:reembed`. The old
vectors are incompatible with the new model and are tracked per row via
`note_embeddings.embedding_model`, so searches never mix two vector spaces.

### If a model stops working

Every model id lives in **`.env`** — that is the only file you edit.

| You changed | What to do next |
|---|---|
| `AI_GEN_MODEL` (answer generation) | Nothing. Restart the server. Retrieval is unaffected. |
| `AI_GEN_FALLBACK_MODEL` | Nothing. Restart the server. |
| `AI_EMBED_MODEL` | **Restart, then run `npm run db:reembed`.** Old vectors are a different mathematical space and cannot be searched with new ones. |
| `AI_EMBED_DIM` | Same as above: restart, then re-run the backfill. The cache key includes the dimension, so stale vectors are not reused. |

Swaps are safe while they are in progress. Vector searches are scoped to
`note_embeddings.embedding_model`, so notes that still carry the previous
model simply do not participate in search until the backfill replaces them —
and they drop back in as the script progresses.

**Finding the current model ids:** the searchable catalogue lives at
<https://ai.google.dev/gemini-api/docs/models>, with embedding guidance in
<https://ai.google.dev/gemini-api/docs/embeddings>. Avoid `*-latest` aliases:
Google hot-swaps the underlying model without notice, which would silently
invalidate every stored vector.

**A dead model announces itself at boot.** On startup the server pings each
configured model once and prints, for example:

```
[ai] embedding   OK  gemini-embedding-2 (768 dims)
[ai] generation  OK  gemini-3.8-flash
```

or, for an unusable model:

```
[ai] generation model "gemini-3.8-flash" is NOT usable: ... 404 ...
[ai]   -> If it was retired, change AI_GEN_MODEL (or AI_GEN_FALLBACK_MODEL) in .env.
```

Even with a dead generation model, the request chain
(`gemini-3.8-flash` → `gemini-3.5-flash-lite` → Groq) keeps `/rag/ask`
answering, so users see an outage only if every step in the chain fails.

---

## 3. Architecture

```
src/services/ai/
  types.ts       EmbeddingProvider / GenerationProvider interfaces
  index.ts       Provider factory, caching, chunk-to-vector helpers
  gemini.ts      Gemini implementation (embedding + generation)
  groq.ts        Optional Groq implementation (generation only)
  chunker.ts     Paragraph-aware overlapping chunking
  cache.ts       On-disk embedding cache (saves provider quota)
  http.ts        Rate limiter + retry with exponential backoff
  store.ts       Reads/writes the note_embeddings table
  healthcheck.ts Boot-time model id verification
```

Controllers only ever talk to the provider interfaces, so the backing vendor
can be swapped without touching them.

### Request flow

```
POST /api/v1/rag/ask/stream (Ask screen)
  │
  ├─ 1. Embed the question           (asymmetric: "task: question answering | query: ...")
  ├─ 2. Vector search                 HNSW index, ORDER BY embedding <=> $1 LIMIT k
  │     └─ scoped to the user's notes AND the active embedding model
  ├─ 3. Group chunks by note          best chunk per note, max 2 chunks per note
  ├─ 4. Generate the answer           grounded in the retrieved context, ending with a ## 📚 Sources list
  └─ 5. Stream answer deltas as they are generated; finish with { answer, retrievedNotes, sources }
```

`POST /api/v1/rag/ask` remains available for regular JSON responses. The Ask
screen uses `/api/v1/rag/ask/stream`, which sends `meta`, incremental `delta`,
optional `restart` during provider failover, and a final `done` event. Gemini
and Groq use their native generation streams; if generation is unavailable,
the same endpoint returns the extractive or keyword fallback as a complete
delta.

### Embedding formats

`gemini-embedding-2` does not accept a `taskType` parameter; the task is
expressed as a prefix in the text itself:

| Purpose | Format |
|---|---|
| Query | `task: question answering \| query: {question}` |
| Document | `title: {title} \| text: {content}` |

`gemini-embedding-001` does accept `taskType` (`QUESTION_ANSWERING` /
`RETRIEVAL_DOCUMENT`). The provider detects which model is configured and
uses the correct format automatically.

---

## 4. Database

`note_embeddings` gained four columns (migration
`prisma/migrations/3_rag_real_embeddings`):

| Column | Purpose |
|---|---|
| `embedding_model` | Which model produced the vector. Scopes searches to a single vector space. |
| `embedding_dim` | Dimensionality of the stored vector. |
| `chunk_index` | Position of the chunk within its note. Unique per `(note_id, chunk_index)`. |
| `content_hash` | Hash of the embedded text, used to skip unchanged content. |

The `match_notes` RPC in `supabase/schema.sql` accepts `p_embedding_model` and
returns chunk-level results with tags and collection names.

---

## 5. Degraded mode

The API never hard-fails because of the AI provider:

| Missing | Behaviour |
|---|---|
| No `GEMINI_API_KEY` | `/rag/ask` falls back to keyword scoring. Note writes still succeed. |
| Generation provider unavailable | The answer falls back to the retrieved passages, verbatim. `degraded: true` is returned. |
| Embedding provider unavailable at note write time | The note is still saved. Run `npm run db:reembed` later to fill the gap. |

---

## 6. Operations

### Explicit indexing (the ⚡ Index button)

Notes are **not** embedded automatically. You choose what the AI may see:

- **UI (My Notes)** — every note card has an **Index** button. Violet
  `Index` → embeds the note for AI search; green `Indexed` → embeddings exist
  and are current (click again to re-index). Editing a note drops its index,
  so the badge honestly turns back into *Index* until you re-index.
- **UI (Ask My Notes)** — the **⚡ AI Index** sidebar on the Ask screen lists
  every note with a checkbox. Ticking a note indexes it immediately
  (real-time, per-note status shows *Indexing…* → *Ready*) and adds it to the
  search scope. The tick selection is deliberately **not persisted**: each
  visit starts fresh, so the AI only analyses what you ticked for the current
  session. With nothing ticked it searches all indexed notes. The old
  *Sources* / *Search in* / *Ask by Tag* controls were removed from this
  screen — tick the notes you care about instead.
- **Bulk** — `POST /api/v1/notes/index` with `{ "noteIds": [...], "force": false }`
  (up to 50 notes). Notes whose stored chunk hashes already match are skipped
  with status `up_to_date` and cost **zero** API calls.
- **Backfill** — the script below, for bulk/indexing everything.
- **Scope** — `/rag/ask` accepts optional `noteIds` (the Ask screen's tick
  selection) and `collectionIds` arrays; both filter vector search and the
  keyword fallback. Unsetting both searches all indexed notes, including
  notes not in any collection.

### Scanned PDFs & images (OCR)

Uploaded files are converted to text **before** indexing:

| Upload | Extraction |
|---|---|
| Text PDF | `pdf-parse` (text layer) |
| **Scanned PDF (no text layer)** | pages rendered with pdfjs + `@napi-rs/canvas`, then **OCR** |
| Images (png/jpg/tiff/…) | OCR |
| DOCX/DOC/ODT | mammoth |

- The OCR engine is **tesseract.js** — a WebAssembly build of Tesseract that
  runs inside Node with no Python anywhere in the stack. (PaddleOCR itself
  ships only as a Python package; this is the zero-Python equivalent, and the
  same engine this project already used for image uploads.)
- OCR runs at **upload time**, and again during **indexing** for notes that
  still hold a placeholder from before OCR existed — so old scanned uploads
  become searchable without re-uploading.
- A note whose file still cannot be read is skipped at index time and any
  stale placeholder embeddings are deleted, so `[Uploaded Scanned PDF
  Document: …]` chunks can never appear as "matched notes" again.
- Notes still holding a placeholder (from any older version of the app) are
  always reported as **not indexed**, so ticking them in the AI Index panel
  automatically triggers the OCR self-heal. To repair an entire library in
  one go instead:

  ```bash
  npm run db:ocr-heal             # dry run: show what would be extracted
  npm run db:ocr-heal -- --apply  # write the text and re-embed the notes
  ```
- Language data loads from the local `eng.traineddata` in the project root
  when present (fully offline), falling back to the CDN download.
- `PDF_OCR_MAX_PAGES` (default 20) caps how many pages are recognised per
  document so huge scans stay responsive.
- Verify the pipeline any time with `npm run test:ocr` — it builds a
  synthetic scanned PDF (image-only, no text layer) and checks the recognised
  text end to end, offline.

### Backfill

```bash
npm run db:reembed                       # re-embed everything that is stale
npm run db:reembed -- --dry-run          # preview without writing
npm run db:reembed -- --user=<uuid>      # one user only
npm run db:reembed -- --limit=20         # first 20 notes
npm run db:reembed -- --include-trashed  # include notes in the trash
```

The backfill is safe to re-run: notes whose content hashes already match are
skipped, and cached vectors cost no provider quota.

### Tuning

| Variable | Default | Purpose |
|---|---|---|
| `AI_MAX_RPM` | `10` | Requests per minute against the provider. |
| `AI_MIN_SIMILARITY` | `0.25` | Cosine similarity below which a chunk is treated as noise. |
| `AI_MAX_ATTEMPTS` | `5` | Retry attempts for 429 / 5xx / network errors. |
| `AI_TIMEOUT_MS` | `30000` | Per-request timeout for every provider call. The Gemini SDK has no built-in timeout, and without this an unresponsive request would block `/rag/ask` indefinitely. |
| `AI_CACHE_DIR` | `.ai-cache` | Where cached embeddings are stored. |
| `PDF_OCR_MAX_PAGES` | `20` | Maximum pages OCR'd per uploaded scanned PDF. |

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `429 RESOURCE_EXHAUSTED` | Free-tier rate limit | Lower `AI_MAX_RPM`. The retry logic already backs off. |
| "I couldn't find that in your notes." | The note was never indexed, was edited after indexing, or is outside the ticked selection | Tick the note in the ⚡ **AI Index** panel (or click Index in My Notes), then ask again. |
| AI answers from a scanned PDF with nothing / a placeholder | The upload predates OCR, or OCR could not read it | Click ⚡ **Index** on the note — extraction re-runs with OCR. If it still fails, check `npm run test:ocr`. |
| Answer shows raw `**bold**`, `#` or `$...$` | (Historical) plain-text rendering / LaTeX in prompts | Fixed: the prompt forbids LaTeX and answers render as styled Markdown (`MarkdownContent.tsx`). |
| Answers look unrelated | Embeddings are stale | Re-index the note, or run `npm run db:reembed`. |
| `dimension mismatch` | `AI_EMBED_DIM` changed | Re-run the backfill. The cache key includes the dimension, so stale vectors are not reused. |
| `/rag/ask` hangs | (Historical) no per-request timeout | Fixed: every provider call now honors `AI_TIMEOUT_MS`, and `Retry-After` waits are capped at 30s. |

---

## 7. Tests

```bash
npm test          # full suite (providers stubbed, no network, no quota)
npm run test:ocr  # OCR pipeline: synthetic scanned PDF → recognised text
```

`tests/integration/rag.test.ts` stubs the providers and exercises chunking,
pgvector storage, nearest-neighbour retrieval, `collectionIds`/`noteIds`
scoping and user isolation without spending provider quota or needing
network access.
