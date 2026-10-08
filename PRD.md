# Product Requirements Document (PRD) — NoteMind

## 1. Overview & Objectives
**NoteMind** is a high-performance, AI-assisted note-taking and knowledge-base REST API built with Node.js, Express, PostgreSQL, Prisma, and `pgvector`. It empowers users to organize their thoughts, notes, collections, and tags, while enabling Retrieval-Augmented Generation (RAG) Q&A capabilities directly over their personal knowledge repository.

---

## 2. Target Users & Use Cases
* **Knowledge Workers & Students**: Organize notes into custom collections and retrieve precise context using vector search.
* **Developers & AI Engineers**: Integrate a lightweight, PostgreSQL-backed REST API for full-text search and RAG embeddings.

---

## 3. Core Functional Requirements

### 3.1 Authentication & User Management
* User registration (`POST /api/v1/auth/signup`) with salted password hashing (`bcryptjs`).
* User login (`POST /api/v1/auth/login`) returning a signed JSON Web Token (JWT).
* JWT auth middleware for all protected resource routes.

### 3.2 Collections Management
* Create, list, retrieve by ID, update, and delete collections (`/api/v1/collections`).
* Cascade operations when a user account is deleted.

### 3.3 Notes Management
* Full CRUD support for notes (`/api/v1/notes`).
* Cursor-based pagination (`created_at < cursor`) for note listing.
* Input validation using Zod for payload sanitization.
* Automatic vector embedding generation upon note creation or update.

### 3.4 Tagging System
* Create, list, update, and delete tags (`/api/v1/tags`).
* Many-to-many relationship between Notes and Tags via `note_tags`.

### 3.5 RAG & AI Vector Search
* Automated chunking and embedding storage in `note_embeddings` using PostgreSQL `pgvector`.
* Cosine similarity search (`<=>` vector operator) via `/api/v1/rag/ask`.

---

## 4. Non-Functional & Technical Requirements
* **Database**: PostgreSQL 16+ with `pgvector` extension and Prisma ORM schema modeling.
* **Performance**: Proper indexing on `user_id`, `collection_id`, `created_at`, and `tag_id`.
* **Reliability**: Transactional integrity (`BEGIN` / `COMMIT` / `ROLLBACK`) on multi-step write operations.
* **Security**: JWT authorization, hashed passwords, parameterized SQL queries against SQL injection.
* **Testing**: Automated unit tests for validation & auth, and integration test suite using Supertest.
