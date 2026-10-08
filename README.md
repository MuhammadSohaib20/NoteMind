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

## 📄 License

MIT License
