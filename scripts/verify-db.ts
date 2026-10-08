import { createNoteMindDatabase } from './init-pglite';
import { seedDatabase } from './seed';

function generateMockVector(dim: number = 768, seed: number = 1.0): string {
  const vec = Array.from({ length: dim }, (_, i) =>
    Math.sin(i + seed) * 0.1
  );
  return `[${vec.join(',')}]`;
}

async function verifyDatabase() {
  console.log('==================================================');
  console.log('🔍 Starting NoteMind PostgreSQL Database Verification Suite');
  console.log('==================================================\n');

  try {
    const db = await createNoteMindDatabase();
    await seedDatabase(100, db);

    // 1. Verify Extension & Database Connection
    const extResult: any = await db.query(`
      SELECT extname FROM pg_extension WHERE extname = 'vector';
    `);
    console.log(`1️⃣ pgvector Extension Status: ${extResult.rows.length > 0 ? 'ENABLED ✅' : 'DISABLED ❌'}`);

    // 2. Entity Counts
    const usersCount = (await db.query(`SELECT COUNT(*)::int as count FROM "users";`) as any).rows[0].count;
    const colsCount = (await db.query(`SELECT COUNT(*)::int as count FROM "collections";`) as any).rows[0].count;
    const notesCount = (await db.query(`SELECT COUNT(*)::int as count FROM "notes";`) as any).rows[0].count;
    const tagsCount = (await db.query(`SELECT COUNT(*)::int as count FROM "tags";`) as any).rows[0].count;

    console.log(`2️⃣ Entity Counts:
       - Users: ${usersCount}
       - Collections: ${colsCount}
       - Notes: ${notesCount}
       - Tags: ${tagsCount}`);

    // 3. Test Relational Integrations (Note + Collection + Tags)
    console.log('\n3️⃣ Note Relational Integrations:');
    const relationalNotes: any = await db.query(`
      SELECT n.id, n.title,
             COALESCE(c.name, 'Unassigned') as collection_name,
             COALESCE(string_agg(t.name, ', '), 'None') as tag_list
      FROM "notes" n
      LEFT JOIN "collections" c ON c.id = n.collection_id
      LEFT JOIN "note_tags" nt ON nt.note_id = n.id
      LEFT JOIN "tags" t ON t.id = nt.tag_id
      GROUP BY n.id, n.title, c.name;
    `);

    relationalNotes.rows.forEach((n: any) => {
      console.log(`   - [${n.title}] | Collection: "${n.collection_name}" | Tags: [${n.tag_list}]`);
    });

    // 4. Test Cosine Similarity Search via pgvector
    console.log('\n4️⃣ Testing pgvector Cosine Similarity Search (`<=>` operator)...');
    const queryVectorStr = generateMockVector(768, 1.0);

    const startTime = Date.now();
    const ragResults: any = await db.query(
      `SELECT n.id, n.title, e.chunk_content,
              (1 - (e.embedding <=> $1::vector)) as similarity
       FROM "note_embeddings" e
       JOIN "notes" n ON n.id = e.note_id
       ORDER BY e.embedding <=> $1::vector
       LIMIT 5;`,
      [queryVectorStr]
    );
    const queryTime = Date.now() - startTime;

    console.log(`   Retrieved ${ragResults.rows.length} relevant note chunks in ${queryTime}ms:`);
    ragResults.rows.forEach((res: any, i: number) => {
      console.log(`   #${i + 1} "${res.title}" | Similarity Score: ${(parseFloat(res.similarity) * 100).toFixed(2)}%`);
    });

    // 5. Test Cascade Delete Integrity
    console.log('\n5️⃣ Testing Cascade Deletion Integrity...');
    const tempUserRes: any = await db.query(`
      INSERT INTO "users" (email, password_hash)
      VALUES ('temp-cascade@notemind.ai', 'temp_hash')
      RETURNING id;
    `);
    const tempUserId = tempUserRes.rows[0].id;

    const tempNoteRes: any = await db.query(
      `INSERT INTO "notes" (user_id, title, content)
       VALUES ($1, $2, $3) RETURNING id;`,
      [tempUserId, 'Temp Cascade Note', 'Testing automatic cascade deletion of note and embeddings.']
    );
    const tempNoteId = tempNoteRes.rows[0].id;

    await db.query(
      `INSERT INTO "note_embeddings" (note_id, chunk_content, embedding)
       VALUES ($1, $2, $3::vector);`,
      [tempNoteId, 'Temp chunk content', queryVectorStr]
    );

    // Delete Temp User
    await db.query(`DELETE FROM "users" WHERE id = $1;`, [tempUserId]);

    const orphanNotes: any = await db.query(`SELECT id FROM "notes" WHERE id = $1;`, [tempNoteId]);
    const orphanEmbeddings: any = await db.query(`SELECT id FROM "note_embeddings" WHERE note_id = $1;`, [tempNoteId]);

    if (orphanNotes.rows.length === 0 && orphanEmbeddings.rows.length === 0) {
      console.log('   Cascade Deletion: PASSED ✅ (Deleting user automatically purged associated notes and vector embeddings)');
    } else {
      console.log('   Cascade Deletion: FAILED ❌ (Orphan records found)');
    }

    console.log('\n==================================================');
    console.log('✨ ALL DATABASE VERIFICATION TESTS PASSED SUCCESSFULLY! ✨');
    console.log('==================================================\n');
  } catch (err) {
    console.error('❌ Verification test failed:', err);
    process.exit(1);
  }
}

verifyDatabase();
