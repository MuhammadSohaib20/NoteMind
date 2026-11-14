# NoteMind 🧠⚡

An intelligent, full-stack note-taking and knowledge base application featuring RAG (Retrieval-Augmented Generation), search indexing, vector integration, and collection management.

---

## 🌟 Overview

**NoteMind** provides an end-to-end workspace for managing, querying, and interacting with notes using modern AI vector search and PostgreSQL.

- 📝 **Rich Note Management**: Full CRUD operations, tagged notes, and nested collection organization.
- 🔍 **RAG & Search Capabilities**: Ask questions directly across your notes using Retrieval-Augmented Generation context.
- 🔒 **Secure Authentication**: Hardened authentication system, JWT tokens, and rate limiting.
- 🎨 **Modern UI**: Full dark/light mode toggle, clean responsive design built with Vite + React + TailwindCSS.
- 🗄️ **PostgreSQL + pgvector**: One shared database for every device, with Prisma migration SQL tracked by a checksummed migration runner.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS & Lucide Icons
- **State & Data Fetching**: TanStack React Query

### Backend
- **Server**: Node.js & Express (TypeScript)
- **Database**: PostgreSQL 16 + pgvector (via `pg` connection pool)
- **Schema / migrations**: Prisma migration SQL, applied by a checksummed runner
- **API Specification**: OpenAPI 3.0 (`openapi.yaml`)
- **Testing**: Jest & Supertest integration test suite

---

## 🚀 Getting Started

### 1. Prerequisites

- Docker Desktop (recommended), **or**
- Node.js 20+ and a PostgreSQL 16 server with the `pgvector` extension.

### 2. Environment Setup

```bash
cp .env.example .env
```

Set `POSTGRES_PASSWORD` (URL-safe characters), `JWT_SECRET`, and your AI
provider keys. `DATABASE_URL` is used when the API runs outside Docker.

### 3. Run the full stack (one command)

```bash
docker compose up --build -d
```

Open <http://localhost:3000>. Compose starts PostgreSQL, waits for it to become
healthy, then starts the app. Migrations are applied automatically. See
[DOCKER.md](DOCKER.md) for persistence, backups, and the one-time PGlite data
copy.

### 4. Local development (without the app container)

Start only the database:

```bash
docker compose up -d db
```

Install dependencies and run the servers:

```bash
npm install
(cd client && npm install)

# Terminal 1 — API on http://localhost:3000
npm run dev

# Terminal 2 — Vite dev server
cd client && npm run dev
```

---

## 🧪 Testing & Database Scripts

```bash
# Jest integration tests. A disposable `<db>_test` database is recreated
# before every run; the development database is never touched.
npm test

# Apply migrations and print the schema version / pgvector status.
npm run db:init

# Seed 5,000 notes, tags, and 768-dim embeddings (destructive).
npm run db:seed

# Seed a small dataset and verify queries, indexes, and vector search.
npm run db:verify

# Backup to JSON, restore into a throwaway database, verify row counts.
npm run db:backup-restore
```

The PostgreSQL user needs `CREATEDB` for the test database and the restore
drill. The Compose user is a superuser, so this works out of the box.

---

## 📁 Repository Structure

```
├── client/              # React + Vite frontend application
├── prisma/              # Prisma schema & SQL migrations
├── src/                 # Express REST API backend
│   ├── controllers/     # Route logic controllers
│   ├── middleware/      # Auth, logging, rate limiter
│   └── routes/          # API endpoint routes
├── scripts/             # DB seeding, benchmarks, and utility scripts
├── supabase/            # Supabase database schemas & functions
├── tests/               # Unit and integration test suites
├── compose.yaml         # App + PostgreSQL stack
└── Dockerfile           # Multi-stage production image
```

---

## 🚀 Latest Update — Real Gemini RAG + Scanned-PDF OCR

The **Ask My Notes** page now runs a full retrieval-augmented generation pipeline on Google's free Gemini API (no paid tier, no credit card):

- **Real embeddings** — notes are chunked (≈1200 chars, 200 overlap) and embedded with `gemini-embedding-2` (768-dim) into `note_embeddings`, with a 24 h local embedding cache.
- **Explicit AI Index panel** — pick a collection from the dropdown, then tick exactly the notes the assistant may read for that question; the selection resets every visit so answers stay scoped to the current session.
- **Scoped answers** — `/api/v1/rag/ask` retrieves only from the ticked notes (vector similarity + keyword fallback) and `gemini-3.8-flash` composes the answer, with a graceful `gemini-3.5-flash-lite` → Groq fallback chain.
- **Scanned PDF & image OCR** — files without a text layer are rasterised (`pdf-to-img`) and recognised offline with `tesseract.js` and the bundled `eng.traineddata`; older "unreadable upload" placeholders self-heal when the note is re-indexed (`npm run db:ocr-heal`).
- **Styled Markdown answers** — coloured section headings, worked examples and a Sources list, sanitised and rendered client-side (no raw `**`, `#` or LaTeX in answers).

Full architecture, API payloads, tuning knobs and troubleshooting: see **[RAG.md](RAG.md)**. API specification: `openapi.yaml`.

---

## 📄 License

MIT License
