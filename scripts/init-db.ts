import '../src/config/env';
import { closeDatabase, getDatabase } from '../src/db';

/**
 * Connects to PostgreSQL through the application pool, applies any pending
 * migrations, and prints the migration history. Safe to run repeatedly.
 */
async function main(): Promise<void> {
  const db = await getDatabase();

  const version = await db.query<{ version: string }>('SELECT version();');
  const vector = await db.query<{ extversion: string }>(
    `SELECT extversion FROM pg_extension WHERE extname = 'vector';`
  );
  const migrations = await db.query<{ name: string; applied_at: Date }>(
    `SELECT "name", "applied_at" FROM "schema_migrations" ORDER BY "name";`
  );

  console.log('✅ PostgreSQL is ready.');
  console.log(`   Server:   ${version.rows[0]?.version?.split(',')[0] ?? 'unknown'}`);
  console.log(`   pgvector: ${vector.rows[0]?.extversion ?? 'missing'}`);
  console.log(`   Applied migrations: ${migrations.rows.length}`);
  for (const migration of migrations.rows) {
    console.log(`     - ${migration.name} (${migration.applied_at.toISOString()})`);
  }
}

main()
  .then(async () => {
    await closeDatabase();
  })
  .catch(async (error) => {
    console.error('❌ Database initialization failed:', error);
    await closeDatabase();
    process.exit(1);
  });
