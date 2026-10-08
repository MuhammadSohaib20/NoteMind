import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import * as fs from 'fs';
import * as path from 'path';

export async function createNoteMindDatabase() {
  console.log('🚀 Initializing NoteMind WASM PostgreSQL Database (with pgvector)...');
  
  // Persistent data directory in .pglite-data
  const dataDir = path.join(__dirname, '../.pglite-data');
  
  const db = new PGlite(dataDir, {
    extensions: { vector },
  });

  // Enable pgvector
  await db.exec(`CREATE EXTENSION IF NOT EXISTS vector;`);

  // Load and apply initial migration SQL
  const migrationPath = path.join(__dirname, '../prisma/migrations/0_init/migration.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📜 Applying database schema migration & HNSW indexes...');
  await db.exec(migrationSql);
  console.log('✅ Schema migration applied successfully!');

  return db;
}
