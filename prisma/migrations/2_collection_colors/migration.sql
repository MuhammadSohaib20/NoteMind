ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "color_index" INTEGER;

WITH ranked_collections AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) - 1 AS color_index
  FROM "collections"
)
UPDATE "collections" AS collection
SET color_index = ranked_collections.color_index
FROM ranked_collections
WHERE collection.id = ranked_collections.id AND collection.color_index IS NULL;

ALTER TABLE "collections" ALTER COLUMN "color_index" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "collections_user_id_color_index_key"
  ON "collections"("user_id", "color_index");
