import { closeDatabase, getDatabase } from '../../src/db';

describe('PostgreSQL bootstrap and migrations', () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it('connect to PostgreSQL and records every migration exactly once', async () => {
    const db = await getDatabase();
    const result = await db.query<{ name: string }>(
      `SELECT "name" FROM "schema_migrations" ORDER BY "name";`
    );

    expect(result.rows.map((row) => row.name)).toEqual([
      '0_init',
      '1_note_trash_and_previews',
      '2_collection_colors',
      '3_rag_real_embeddings',
    ]);
  });

  it('has pgvector and the embedding metadata columns', async () => {
    const db = await getDatabase();

    const extension = await db.query<{ extversion: string }>(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector';`
    );
    expect(extension.rows).toHaveLength(1);
    expect(extension.rows[0].extversion).toBeTruthy();

    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'note_embeddings';`
    );
    const names = columns.rows.map((row) => row.column_name);

    expect(names).toEqual(
      expect.arrayContaining([
        'embedding',
        'embedding_model',
        'embedding_dim',
        'chunk_index',
        'content_hash',
      ])
    );
  });

  it('reuses the same pool instead of reconnecting on every call', async () => {
    const first = await getDatabase();
    const second = await getDatabase();
    expect(second).toBe(first);
  });
});
