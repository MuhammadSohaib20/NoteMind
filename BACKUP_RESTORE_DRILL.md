# NoteMind Database Backup Strategy & Restore Drill Report

## 1. Overview & Policy

This document defines the official **Backup Strategy** and documents the **Restore Drill** execution for NoteMind API (Deliverable 1 / Week 4).

### Backup Objectives
- **Recovery Point Objective (RPO)**: Maximum allowable data loss is **< 1 hour**.
- **Recovery Time Objective (RTO)**: Maximum acceptable downtime for full database restoration is **< 15 minutes**.
- **Backup Types**:
  1. **Logical snapshots**: `pg_dump` (or the JSON snapshot produced by `npm run db:backup-restore`) for portable full backups.
  2. **Continuous WAL / Transaction Logs** (Production PostgreSQL / Supabase): Enables point-in-time recovery (PITR).

---

## 2. Automated Backup Execution

### Execution Command
```bash
npm run db:backup-restore
```

### Process Description
1. Connects to the active PostgreSQL database through the application pool.
2. Opens a `REPEATABLE READ`, `READ ONLY` transaction so every table is read from one consistent snapshot.
3. Extracts entity state from `users`, `collections`, `notes`, `tags`, `note_tags`, and `note_embeddings`.
4. Serializes the snapshot into `./backups/backup_<timestamp>.json`.
5. Restores that snapshot into a throwaway database and verifies row counts before dropping it.

For production, prefer `pg_dump -Fc` for large databases, plus WAL archiving
or the provider's PITR feature. The JSON drill is a portability and verification
exercise, not a replacement for `pg_dump`.

---

## 3. Restore Drill Verification Procedure

To ensure backups are not corrupted and can be restored reliably under disaster recovery conditions:

1. **Isolation**: A throwaway PostgreSQL database is created (`notemind_restore_<timestamp>`). Permanent data is never truncated or overwritten.
2. **Schema Application**: Every migration in `prisma/migrations/` is replayed through the real migration runner, including the pgvector extension and `schema_migrations` checksums.
3. **Data Ingestion**: Tables are re-populated in one transaction, respecting foreign keys (`users` -> `collections` & `tags` -> `notes` -> `note_tags` & `note_embeddings`).
4. **Validation**: Row counts are compared table by table against the source snapshot.
5. **Cleanup**: The throwaway database is terminated and dropped.

---

## 4. Disaster Recovery Checklist

- [x] Full Database Export Script implemented (`scripts/backup-restore.ts`).
- [x] Foreign Key & Constraint integrity validated during restore drill.
- [x] Automated restore verification test passes with zero data loss.
- [x] Backup directory added to secure storage location.
