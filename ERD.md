# Entity Relationship Diagram (ERD) — NoteMind

This document details the entity relationships in the NoteMind PostgreSQL database schema.

```mermaid
erDiagram
    users ||--o{ collections : "owns"
    users ||--o{ notes : "owns"
    users ||--o{ tags : "owns"
    collections ||--o{ notes : "contains"
    notes ||--o{ note_tags : "has"
    tags ||--o{ note_tags : "applied to"
    notes ||--o{ note_embeddings : "has vector chunks"

    users {
        uuid id PK
        varchar email UK
        text password_hash
        timestamp created_at
        timestamp updated_at
    }

    collections {
        uuid id PK
        uuid user_id FK
        varchar name
        integer color_index
        timestamp created_at
        timestamp updated_at
    }

    notes {
        uuid id PK
        uuid user_id FK
        uuid collection_id FK
        varchar title
        text content
        varchar file_name
        varchar file_type
        text file_data
        text file_preview
        timestamp deleted_at
        timestamp created_at
        timestamp updated_at
    }

    tags {
        uuid id PK
        uuid user_id FK
        varchar name
        timestamp created_at
        timestamp updated_at
    }

    note_tags {
        uuid note_id PK,FK
        uuid tag_id PK,FK
    }

    note_embeddings {
        uuid id PK
        uuid note_id FK
        text chunk_content
        vector embedding
        timestamp created_at
    }
```

---

## Entity Descriptions & Constraints

1. **`users`**: Represents application users with unique emails and hashed credentials.
2. **`collections`**: Folders owned by users to categorize notes. `color_index` is unique per user and remains attached to the collection so its color is stable across the app.
3. **`notes`**: Core document entity. Soft linked to collections (`ON DELETE SET NULL`) and owned by users (`ON DELETE CASCADE`). `deleted_at` marks notes in Trash; restoring clears it, while permanent deletion removes the note and its dependent records.
4. **`tags`**: Unique tag names per user (`@@unique([userId, name])`).
5. **`note_tags`**: Junction table maintaining many-to-many relationship between Notes and Tags.
6. **`note_embeddings`**: Vector embedding table storing 768-dimensional vectors with `pgvector` for similarity queries.
