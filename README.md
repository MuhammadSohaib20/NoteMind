# NoteMind 🧠⚡

An intelligent, full-stack note-taking and knowledge base application featuring RAG (Retrieval-Augmented Generation), search indexing, vector integration, and collection management.

---

## 🌟 Overview

**NoteMind** provides an end-to-end workspace for managing, querying, and interacting with notes using modern AI vector search and local databases.

- 📝 **Rich Note Management**: Full CRUD operations, tagged notes, and nested collection organization.
- 🔍 **RAG & Search Capabilities**: Ask questions directly across your notes using Retrieval-Augmented Generation context.
- 🔒 **Secure Authentication**: Hardened authentication system, JWT tokens, and rate limiting.
- 🎨 **Modern UI**: Full dark/light mode toggle, clean responsive design built with Vite + React + TailwindCSS.
- 🗄️ **Flexible Database Support**: PostgreSQL database schema with Prisma ORM and Supabase/PGlite integration.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS & Lucide Icons
- **State & Data Fetching**: TanStack React Query

### Backend
- **Server**: Node.js & Express (TypeScript)
- **Database / ORM**: PostgreSQL / Prisma ORM
- **API Specification**: OpenAPI 3.0 (`openapi.yaml`)
- **Testing**: Jest & Supertest integration test suite

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- npm or yarn
- PostgreSQL (or local PGlite)

### 2. Environment Setup
Copy the example environment file and configure your local settings:

```bash
cp .env.example .env
```

Set your local PostgreSQL database URL in `.env`:
```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/notemind?schema=public"
```

### 3. Installation
Install root dependencies and client dependencies:

```bash
# Install backend dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 4. Running the Project

**Start backend API server:**
```bash
npm run dev
```

**Start frontend client:**
```bash
cd client
npm run dev
```

---

## 🧪 Testing & Database Scripts

```bash
# Run backend integration tests
npm test

# Run database verification & seed script
npx ts-node scripts/verify-db.ts
```

---

## 📁 Repository Structure

```
├── client/              # React + Vite frontend application
├── prisma/              # Prisma schema & migrations
├── src/                 # Express REST API backend
│   ├── controllers/     # Route logic controllers
│   ├── middleware/      # Auth, logging, rate limiter
│   └── routes/          # API endpoint routes
├── scripts/             # DB seeding, benchmarks, and utility scripts
├── supabase/            # Supabase database schemas & functions
└── tests/               # Unit and integration test suites
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
