ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "file_preview" TEXT;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "notes_user_id_deleted_at_idx" ON "notes"("user_id", "deleted_at");
