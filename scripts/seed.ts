import '../src/config/env';
import { closeDatabase, Database, getDatabase, withTransactionOn } from '../src/db';

function generateMockVector(dim: number = 768, seed: number = 0.5): string {
  const vec = Array.from({ length: dim }, (_, i) => Math.sin(i + seed) * 0.1);
  return `[${vec.join(',')}]`;
}

/**
 * Seeds a realistic volume of data. This is destructive: every application
 * table is cleared first. It refuses to run against NODE_ENV=production unless
 * ALLOW_DESTRUCTIVE_SEED=true is set explicitly.
 */
export async function seedDatabase(count: number = 5000, db?: Database): Promise<void> {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DESTRUCTIVE_SEED !== 'true'
  ) {
    throw new Error(
      'Refusing to wipe a production database. Set ALLOW_DESTRUCTIVE_SEED=true to override.'
    );
  }

  const ownsDatabase = !db;
  const database = db ?? (await getDatabase());

  console.log(`🌱 Seeding NoteMind database with ${count} notes...`);
  const startTime = Date.now();

  try {
    await withTransactionOn(database, async (client) => {
      // Child tables first so foreign keys never block the reset.
      await client.query(`
        DELETE FROM "note_embeddings";
        DELETE FROM "note_tags";
        DELETE FROM "tags";
        DELETE FROM "notes";
        DELETE FROM "collections";
        DELETE FROM "users";
      `);

      const userRes = await client.query(
        `INSERT INTO "users" (email, password_hash)
         VALUES ('sohaib@notemind.ai', '$2b$12$eImiTXuWVxfM37uY4JANjO5E.y5dK.X8x9Q/8L0E9Y6zZ9k1Q2k3y')
         RETURNING id, email;`
      );
      const user = userRes.rows[0] as any;

      const collectionNames = [
        '8-Week Internship Notes',
        'RAG & AI Architecture',
        'Database Systems',
        'Express API Specs',
      ];
      const collectionIds: string[] = [];
      for (const [colorIndex, name] of collectionNames.entries()) {
        const res = await client.query(
          `INSERT INTO "collections" (user_id, name, color_index)
           VALUES ($1, $2, $3) RETURNING id;`,
          [user.id, name, colorIndex]
        );
        collectionIds.push((res.rows[0] as any).id);
      }

      const tagNames = [
        'Prisma',
        'PostgreSQL',
        'RAG-Pipeline',
        'Express',
        'Zod',
        'Performance',
      ];
      const tagIds: string[] = [];
      for (const name of tagNames) {
        const res = await client.query(
          `INSERT INTO "tags" (user_id, name) VALUES ($1, $2) RETURNING id;`,
          [user.id, name]
        );
        tagIds.push((res.rows[0] as any).id);
      }

      const sampleTitles = [
        'Database Schema Setup with pgvector',
        'Retrieval Augmented Generation Workflow',
        'EXPLAIN ANALYZE and Index Optimization',
        'Correcting N+1 Query Anti-Pattern in Express',
        'Configuring Connection Pooling and Transactions',
        'Cursor-Based Pagination Implementation',
      ];

      for (let index = 0; index < count; index++) {
        const title = `${sampleTitles[index % sampleTitles.length]} #${index + 1}`;
        const content =
          `Content body for realistic volume test #${index + 1}. ` +
          'Explores PostgreSQL database performance, vector search with pgvector, ' +
          'and transactional write patterns.';
        const collectionId = collectionIds[index % collectionIds.length];

        const noteRes = await client.query(
          `INSERT INTO "notes" (user_id, collection_id, title, content)
           VALUES ($1, $2, $3, $4) RETURNING id;`,
          [user.id, collectionId, title, content]
        );
        const noteId = (noteRes.rows[0] as any).id;

        await client.query(
          `INSERT INTO "note_tags" (note_id, tag_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [noteId, tagIds[index % tagIds.length]]
        );

        await client.query(
          `INSERT INTO "note_embeddings" (note_id, chunk_content, embedding)
           VALUES ($1, $2, $3::vector);`,
          [noteId, content, generateMockVector(768, index)]
        );
      }
    });
  } finally {
    if (ownsDatabase) {
      await closeDatabase();
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Seeded ${count} notes, tags, and 768-dim embeddings in ${durationSec}s.`);
  console.log('🎉 Realistic seeding completed successfully.\n');
}

if (require.main === module) {
  seedDatabase(5000).catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
}
