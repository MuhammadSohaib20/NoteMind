# Deliverable 2 Report: NoteMind RAG & AI Pipeline

**Project:** NoteMind  
**Deliverable:** 2 — Retrieval-Augmented Generation (RAG) & Multimodal AI Ingestion  
**Status:** Complete  

---

## 1. Architectural Decisions

1. **Provider Chain with Instant Failover**
   - **Primary Embeddings:** Google Gemini (`gemini-embedding-2`, 768 dimensions) with asymmetric task prompts (`task: question answering | query: ...`).
   - **Primary Generation:** Google Gemini (`gemini-2.5-flash`), backed up by Groq (`llama-3.3-70b-versatile`).
   - **Decision:** Rather than relying on a single vendor or failing hard on quota limits, NoteMind implements an automatic fallback cascade with request-level deadlines. If Gemini is unreachable or rate-limited (HTTP 429/503), the engine falls back to Groq without interrupting the user.

2. **Real-time Answer Streaming via Server-Sent Events (SSE)**
   - **Decision:** Implemented `POST /api/v1/rag/ask/stream` using SSE (`text/event-stream`).
   - **Protocol:**
     - `meta`: Immediately dispatches retrieved context count and query metadata.
     - `delta`: Streams LLM text deltas token-by-token for natural typing latency.
     - `restart`: If a provider stalls mid-stream and failover kicks in, the client resets buffer cleanly.
     - `done`: Final structured payload including full markdown answer, cited note sources, and degradation status (`degraded: false`).
   - Standard non-streaming `POST /api/v1/rag/ask` is preserved for programmatic batch callers.

3. **Background Auto-Indexing on Write & Self-Healing**
   - **Decision:** Asynchronous auto-indexing on note creation and updates (`POST /api/v1/notes`, `PUT /api/v1/notes/:id`).
   - **Design:** Creating or editing a note immediately returns HTTP 201/200 so the UI remains instantaneous (<50ms). A background task chunks and embeds the content without blocking user input.
   - **Self-Healing:** When the note list is fetched, any unindexed note is automatically scheduled for indexing in the background. The manual `POST /api/v1/notes/index` endpoint remains available for bulk admin re-indexing.

4. **Two-Tier Document Ingestion & Scanned OCR**
   - **Digital PDFs & Documents:** Extracted via fast text stream parsers (`pdf-parse`, `mammoth`).
   - **Scanned PDFs & Images:** Converted to high-DPI page buffers via `@napi-rs/canvas` / `pdf-to-img` and processed through Tesseract OCR (`tesseract.js`) with per-page deadlines.

---

## 2. Key Engineering Trade-offs

| Decision | Alternative Considered | Why Chosen | Trade-off Made |
|---|---|---|---|
| **SSE Streaming** | Long-polling or single-shot JSON | Lower perceived latency; user sees thoughts formulate in real time. | Higher connection handling complexity; SSE requires custom chunk parsing on the client. |
| **Async Auto-Indexing** | Synchronous embedding on note save | Zero latency impact on note typing and autosave. | Very brief window (<1-2s) where newly typed note is being embedded; mitigated by optimistic UI and list-fetch self-healing. |
| **PGLite with pgvector** | External managed vector DB (Pinecone / Weaviate) | Zero cloud dependencies for local dev, fully reproducible hermetic integration test suite in CI. | Limited to single-node scale; HNSW index memory is shared with the PostgreSQL process. |
| **Chunking Strategy (500 chars / 100 overlap)** | Paragraph-level or page-level chunking | Granular semantic matching that highlights exact sentences in cited sources. | Larger index size; requires deduplication when aggregating sources in the final answer. |

---

## 3. Live Testing Verification

### A. Live Model Generation (`degraded: false`)
- **Live Provider:** Gemini `gemini-2.5-flash` with active `GEMINI_API_KEY`.
- **Query Executed:** Asked complex analytical questions across multiple notes.
- **Result:** Successfully streamed complete Markdown answers with headers, bullet points, and source citations. DevTools payload confirmed:
  ```json
  {
    "degraded": false,
    "provider": "gemini",
    "sources": [ ... ]
  }
  ```

### B. Typed Note RAG Demo
- Created a note titled *"Project Delta Launch Notes"* detailing specific dates, milestones, and tech stacks.
- Asked: *"What are the launch milestones for Project Delta?"*
- **Outcome:** Exact semantic retrieval matching chunk score > 0.82; answer synthesised accurately from note content with direct link to the note.

### C. Scanned PDF & OCR Extraction Demo
- Uploaded a scanned image-only PDF document (*receipt / scanned handwritten memo*).
- OCR background pipeline processed image frames, extracted text content into the note body, and triggered auto-indexing.
- Asked a specific factual question present only within the scanned image text.
- **Outcome:** Extracted text matched via vector similarity; model generated accurate grounded answer with `degraded: false`.

### D. Automated Integration & Regression Suite
- All 5 test suites passed hermetically (46/46 unit, integration, and validation tests passing).
- Validated RAG vector search, scoped note filtering, multi-user isolation, and SSE streaming endpoints.
