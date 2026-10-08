# NoteMind Database Backup Strategy & Restore Drill Report

## 1. Overview & Policy

This document defines the official **Backup Strategy** and documents the **Restore Drill** execution for NoteMind API (Deliverable 1 / Week 4).

### Backup Objectives
- **Recovery Point Objective (RPO)**: Maximum allowable data loss is **< 1 hour**.
- **Recovery Time Objective (RTO)**: Maximum acceptable downtime for full database restoration is **< 15 minutes**.
- **Backup Types**:
  1. **Automated Daily Snapshots**: Full export of database schema and table contents stored in immutable JSON/SQL formats.
  2. **Continuous WAL / Transaction Logs** (Production PostgreSQL / Supabase): Enables point-in-time recovery (PITR).

---

## 2. Automated Backup Execution

### Execution Command
```bash
npm run db:backup-restore
```

### Process Description
1. Connects to the active primary database instance.
2. Extracts entity state from `users`, `collections`, `notes`, `tags`, `note_tags`, and `note_embeddings`.
3. Serializes the snapshot into `./backups/backup_<timestamp>.json` with complete relational context.

---

## 3. Restore Drill Verification Procedure

To ensure backups are not corrupted and can be restored reliably under disaster recovery conditions:

1. **Isolation**: A clean, uninitialized temporary database instance is created (`.pglite-restore-test`).
2. **Schema Application**: The initial migration schema (`prisma/migrations/0_init/migration.sql`) is executed on the target instance.
3. **Data Ingestion**: Tables are re-populated sequentially maintaining foreign key dependency order (`users` -> `collections` & `tags` -> `notes` -> `note_tags` & `note_embeddings`).
4. **Validation**: Row counts and relational integrity are verified against the source database.

---

## 4. Disaster Recovery Checklist

- [x] Full Database Export Script implemented (`scripts/backup-restore.ts`).
- [x] Foreign Key & Constraint integrity validated during restore drill.
- [x] Automated restore verification test passes with zero data loss.
- [x] Backup directory added to secure storage location.
