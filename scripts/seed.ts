import { createNoteMindDatabase } from './init-pglite';

function generateMockVector(dim: number = 768, seed: number = 0.5): string {
  const vec = Array.from({ length: dim }, (_, i) =>
    Math.sin(i + seed) * 0.1
  );
  return `[${vec.join(',')}]`;
}

export async function seedDatabase(count: number = 5000, db?: any) {
  if (!db) {
    db = await createNoteMindDatabase();
  }

  console.log(`🌱 Seeding NoteMind database with realistic volume of data (${count} notes)...`);
  const startTime = Date.now();

  // Clean existing data
  await db.exec(`
    DELETE FROM "note_embeddings";
    DELETE FROM "note_tags";
    DELETE FROM "tags";
    DELETE FROM "notes";
    DELETE FROM "collections";
    DELETE FROM "users";
  `);

  // 1. Create Main User
  const userRes = await db.query(`
    INSERT INTO "users" (email, password_hash)
    VALUES ('sohaib@notemind.ai', '$2b$12$eImiTXuWVxfM37uY4JANjO5E.y5dK.X8x9Q/8L0E9Y6zZ9k1Q2k3y')
    RETURNING id, email;
  `);
  const user = userRes.rows[0] as any;

  // 2. Create Collections
  const colNames = ['8-Week Internship Notes', 'RAG & AI Architecture', 'Database Systems', 'Express API Specs'];
  const collectionIds: string[] = [];
  for (const name of colNames) {
    const res = await db.query(
      `INSERT INTO "collections" (user_id, name) VALUES ($1, $2) RETURNING id;`,
      [user.id, name]
    );
    collectionIds.push((res.rows[0] as any).id);
  }

  // 3. Create Tags
  const tagNames = ['Prisma', 'PostgreSQL', 'RAG-Pipeline', 'Express', 'Zod', 'Performance'];
  const tagIds: string[] = [];
  for (const name of tagNames) {
    const res = await db.query(
      `INSERT INTO "tags" (user_id, name) VALUES ($1, $2) RETURNING id;`,
      [user.id, name]
    );
    tagIds.push((res.rows[0] as any).id);
  }

  // 4. Batch Seed Notes & Embeddings in Transactions
  const batchSize = 1000;
  const sampleTitles = [
    'Database Schema Setup with pgvector',
    'Retrieval Augmented Generation Workflow',
    'EXPLAIN ANALYZE and Index Optimization',
    'Correcting N+1 Query Anti-Pattern in Express',
    'Configuring Connection Pooling and Transactions',
    'Cursor-Based Pagination Implementation'
  ];

  for (let i = 0; i < count; i += batchSize) {
    await db.query('BEGIN;');

    for (let j = 0; j < batchSize && i + j < count; j++) {
      const idx = i + j;
      const title = `${sampleTitles[idx % sampleTitles.length]} #${idx + 1}`;
      const content = `Content body for realistic volume test #${idx + 1}. Explores PostgreSQL database performance, vector search with pgvector, and transactional write patterns.`;
      const colId = collectionIds[idx % collectionIds.length];

      const noteRes = await db.query(
        `INSERT INTO "notes" (user_id, collection_id, title, content)
         VALUES ($1, $2, $3, $4) RETURNING id;`,
        [user.id, colId, title, content]
      );
      const noteId = (noteRes.rows[0] as any).id;

      // Attach Tag
      const tagId = tagIds[idx % tagIds.length];
      await db.query(
        `INSERT INTO "note_tags" (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
        [noteId, tagId]
      );

      // Attach Embedding
      const vecStr = generateMockVector(768, idx);
      await db.query(
        `INSERT INTO "note_embeddings" (note_id, chunk_content, embedding)
         VALUES ($1, $2, $3::vector);`,
        [noteId, content, vecStr]
      );
    }

    await db.query('COMMIT;');
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Seeded ${count} notes, tags, and 768-dim embeddings in ${durationSec}s.`);
  console.log('🎉 Realistic Seeding completed successfully!\n');
}

if (require.main === module) {
  seedDatabase(5000);
}
