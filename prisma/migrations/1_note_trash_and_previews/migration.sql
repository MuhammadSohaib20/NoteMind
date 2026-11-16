CREATE INDEX IF NOT EXISTS "notes_user_id_deleted_at_idx" ON "notes"("user_id", "deleted_at");
