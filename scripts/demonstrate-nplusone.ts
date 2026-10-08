import { createNoteMindDatabase } from './init-pglite';

export async function demonstrateNPlusOneQueryFix() {
  console.log('==================================================');
  console.log('🛠️ Week 3: N+1 Query Pattern vs JOIN Optimization');
  console.log('==================================================\n');

  const db = await createNoteMindDatabase();

  const userRes = await db.query(`SELECT id FROM "users" LIMIT 1;`);
  if (userRes.rows.length === 0) {
    console.log('⚠️ No user found. Run seed script first.');
    return;
  }
  const userId = (userRes.rows[0] as any).id;

  // 1. Intentionally Introduced N+1 Query Pattern
  console.log('❌ 1. Executing Intentionally Introduced N+1 Query Pattern...');
  const startNPlusOne = Date.now();

  // Query 1: Fetch all notes
  const notesRes = await db.query(
    `SELECT id, title FROM "notes" WHERE user_id = $1 LIMIT 100;`,
    [userId]
  );
  const notes = notesRes.rows as any[];

  // Query N: Loop through each note to fetch its tags individually
  let totalQueriesExecuted = 1;
  const nPlusOneResults = [];

  for (const note of notes) {
    const tagRes = await db.query(
      `SELECT t.name
       FROM "tags" t
       JOIN "note_tags" nt ON nt.tag_id = t.id
       WHERE nt.note_id = $1;`,
      [note.id]
    );
    totalQueriesExecuted++;
    nPlusOneResults.push({
      ...note,
      tags: tagRes.rows.map((r: any) => r.name),
    });
  }

  const durationNPlusOne = Date.now() - startNPlusOne;
  console.log(`   Queries Executed: ${totalQueriesExecuted} (1 parent + ${notes.length} children)`);
  console.log(`   Time Taken: ${durationNPlusOne}ms\n`);

  // 2. Corrected Query Pattern using SQL JOIN & Aggregation (1 Query)
  console.log('✅ 2. Executing Corrected SQL JOIN Batch Query Pattern (1 Query)...');
  const startOptimized = Date.now();

  const optimizedRes = await db.query(
    `SELECT n.id, n.title,
            COALESCE(string_agg(t.name, ','), '') as "tagNames"
     FROM "notes" n
     LEFT JOIN "note_tags" nt ON nt.note_id = n.id
     LEFT JOIN "tags" t ON t.id = nt.tag_id
     WHERE n.user_id = $1
     GROUP BY n.id
     LIMIT 100;`,
    [userId]
  );

  const optimizedResults = optimizedRes.rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    tags: r.tagNames ? r.tagNames.split(',') : [],
  }));

  const durationOptimized = Date.now() - startOptimized;
  console.log(`   Queries Executed: 1 (Single JOIN query)`);
  console.log(`   Time Taken: ${durationOptimized}ms\n`);

  console.log('--------------------------------------------------');
  console.log(`⚡ Performance Gain: Reduced DB roundtrips from ${totalQueriesExecuted} to 1 query!`);
  console.log('==================================================\n');
}

if (require.main === module) {
  demonstrateNPlusOneQueryFix();
}
