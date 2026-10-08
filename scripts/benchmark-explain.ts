import { createNoteMindDatabase } from './init-pglite';

export async function runExplainAnalyzeBenchmarks() {
  console.log('==================================================');
  console.log('⚡ NoteMind PostgreSQL EXPLAIN ANALYZE Benchmarking');
  console.log('==================================================\n');

  const db = await createNoteMindDatabase();

  // Get user ID
  const userRes = await db.query(`SELECT id FROM "users" LIMIT 1;`);
  if (userRes.rows.length === 0) {
    console.log('⚠️ No users found. Run `npm run db:seed:large` first.');
    return;
  }
  const userId = (userRes.rows[0] as any).id;

  // 1. Benchmark Note Retrieval by User ID & Created Timestamp Index
  console.log('1️⃣ Benchmarking Note Listing with Cursor (Index: notes_user_id_idx & notes_created_at_idx)...');
  const explainList = await db.query(
    `EXPLAIN ANALYZE
     SELECT id, title, created_at
     FROM "notes"
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10;`,
    [userId]
  );
  console.log('--- Query Plan Output ---');
  explainList.rows.forEach((row: any) => console.log(Object.values(row)[0]));
  console.log('-------------------------\n');

  // 2. Benchmark Vector Search Query
  console.log('2️⃣ Benchmarking pgvector Cosine Similarity Search...');
  const queryVec = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.1);
  const vecStr = `[${queryVec.join(',')}]`;

  const explainVector = await db.query(
    `EXPLAIN ANALYZE
     SELECT n.id, n.title, (1 - (e.embedding <=> $1::vector)) as similarity
     FROM "note_embeddings" e
     JOIN "notes" n ON n.id = e.note_id
     WHERE n.user_id = $2
     ORDER BY e.embedding <=> $1::vector
     LIMIT 3;`,
    [vecStr, userId]
  );
  console.log('--- Query Plan Output ---');
  explainVector.rows.forEach((row: any) => console.log(Object.values(row)[0]));
  console.log('-------------------------\n');

  // 3. Benchmark Tag JOIN Search
  console.log('3️⃣ Benchmarking Tag Filtered Search...');
  const explainTag = await db.query(
    `EXPLAIN ANALYZE
     SELECT n.id, n.title, t.name as tag_name
     FROM "notes" n
     JOIN "note_tags" nt ON nt.note_id = n.id
     JOIN "tags" t ON t.id = nt.tag_id
     WHERE n.user_id = $1 AND t.name = 'typescript'
     LIMIT 10;`,
    [userId]
  );
  console.log('--- Query Plan Output ---');
  explainTag.rows.forEach((row: any) => console.log(Object.values(row)[0]));
  console.log('-------------------------\n');

  console.log('✨ EXPLAIN ANALYZE Benchmarking completed successfully!\n');
}

if (require.main === module) {
  runExplainAnalyzeBenchmarks();
}
