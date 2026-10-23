import { getDatabase } from '../src/db';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import * as fs from 'fs';
import * as path from 'path';

interface BackupData {
  timestamp: string;
  tables: {
    users: any[];
    collections: any[];
    notes: any[];
    tags: any[];
    note_tags: any[];
    note_embeddings: any[];
  };
}

export async function runBackupAndRestoreDrill() {
  console.log('📦 Starting Database Backup Strategy & Restore Drill...\n');

  // 1. Connect to Primary Database
  const db = await getDatabase();
  console.log('1️⃣ Extracting data snapshot from primary database...');

  const users = (await db.query(`SELECT * FROM "users";`)).rows as any[];
  const collections = (await db.query(`SELECT * FROM "collections";`)).rows as any[];
  const notes = (await db.query(`SELECT * FROM "notes";`)).rows as any[];
  const tags = (await db.query(`SELECT * FROM "tags";`)).rows as any[];
  const note_tags = (await db.query(`SELECT * FROM "note_tags";`)).rows as any[];
  const note_embeddings = (await db.query(`SELECT * FROM "note_embeddings";`)).rows as any[];

  const backupData: BackupData = {
    timestamp: new Date().toISOString(),
    tables: {
      users,
      collections,
      notes,
      tags,
      note_tags,
      note_embeddings,
    },
  };

  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFileName = `backup_${Date.now()}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`✅ Backup successfully created at: ${backupFilePath}`);
  console.log(`   - Users: ${users.length}`);
  console.log(`   - Collections: ${collections.length}`);
  console.log(`   - Notes: ${notes.length}`);
  console.log(`   - Tags: ${tags.length}`);
  console.log(`   - Note Tags: ${note_tags.length}`);
  console.log(`   - Note Embeddings: ${note_embeddings.length}\n`);

  // 2. Perform Restore Drill into isolated Target DB
  console.log('2️⃣ Executing Restore Drill into fresh, isolated database target...');
  
  const restoreDbDir = path.join(__dirname, '../.pglite-restore-test');
  if (fs.existsSync(restoreDbDir)) {
    fs.rmSync(restoreDbDir, { recursive: true, force: true });
  }

  const restoredDb = new PGlite(restoreDbDir, {
    extensions: { vector },
  });

  await restoredDb.exec(`CREATE EXTENSION IF NOT EXISTS vector;`);

  // Apply schema migration
  const migrationPath = path.join(__dirname, '../prisma/migrations/0_init/migration.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await restoredDb.exec(migrationSql);

  // Restore tables
  for (const user of users) {
    await restoredDb.query(
      `INSERT INTO "users" (id, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5);`,
      [user.id, user.email, user.password_hash, user.created_at, user.updated_at]
    );
  }

  const nextColorIndexByUser = new Map<string, number>();
  for (const collection of collections) {
    const fallbackColorIndex = nextColorIndexByUser.get(collection.user_id) || 0;
    const colorIndex = collection.color_index ?? fallbackColorIndex;
    nextColorIndexByUser.set(collection.user_id, Math.max(fallbackColorIndex, colorIndex + 1));
    await restoredDb.query(
      `INSERT INTO "collections" (id, user_id, name, color_index, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6);`,
      [collection.id, collection.user_id, collection.name, colorIndex, collection.created_at, collection.updated_at]
    );
  }

  for (const note of notes) {
    await restoredDb.query(
      `INSERT INTO "notes" (id, user_id, collection_id, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [note.id, note.user_id, note.collection_id, note.title, note.content, note.created_at, note.updated_at]
    );
  }

  for (const tag of tags) {
    await restoredDb.query(
      `INSERT INTO "tags" (id, user_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5);`,
      [tag.id, tag.user_id, tag.name, tag.created_at, tag.updated_at || new Date().toISOString()]
    );
  }

  for (const nt of note_tags) {
    await restoredDb.query(
      `INSERT INTO "note_tags" (note_id, tag_id) VALUES ($1, $2);`,
      [nt.note_id, nt.tag_id]
    );
  }

  for (const ne of note_embeddings) {
    await restoredDb.query(
      `INSERT INTO "note_embeddings" (id, note_id, chunk_content, embedding, created_at) VALUES ($1, $2, $3, $4, $5);`,
      [ne.id, ne.note_id, ne.chunk_content, ne.embedding, ne.created_at]
    );
  }

  console.log('✅ All data restored into test database target successfully.');

  // 3. Verification & Validation
  console.log('\n3️⃣ Verifying Data Integrity of Restored Database...');

  const restoredUsers = ((await restoredDb.query(`SELECT COUNT(*)::int as count FROM "users";`)).rows[0] as any).count;
  const restoredCollections = ((await restoredDb.query(`SELECT COUNT(*)::int as count FROM "collections";`)).rows[0] as any).count;
  const restoredNotes = ((await restoredDb.query(`SELECT COUNT(*)::int as count FROM "notes";`)).rows[0] as any).count;
  const restoredTags = ((await restoredDb.query(`SELECT COUNT(*)::int as count FROM "tags";`)).rows[0] as any).count;
  const restoredNoteTags = ((await restoredDb.query(`SELECT COUNT(*)::int as count FROM "note_tags";`)).rows[0] as any).count;
  const restoredEmbeddings = ((await restoredDb.query(`SELECT COUNT(*)::int as count FROM "note_embeddings";`)).rows[0] as any).count;

  const passed =
    restoredUsers === users.length &&
    restoredCollections === collections.length &&
    restoredNotes === notes.length &&
    restoredTags === tags.length &&
    restoredNoteTags === note_tags.length &&
    restoredEmbeddings === note_embeddings.length;

  if (passed) {
    console.log('🎉 RESTORE DRILL VERIFICATION PASSED 100%!');
    console.log(`   - Verified Users: ${restoredUsers} / ${users.length}`);
    console.log(`   - Verified Collections: ${restoredCollections} / ${collections.length}`);
    console.log(`   - Verified Notes: ${restoredNotes} / ${notes.length}`);
    console.log(`   - Verified Tags: ${restoredTags} / ${tags.length}`);
  } else {
    console.error('❌ RESTORE DRILL VERIFICATION FAILED: Row count mismatch!');
    process.exit(1);
  }

  // Cleanup temporary restore test directory
  if (fs.existsSync(restoreDbDir)) {
    fs.rmSync(restoreDbDir, { recursive: true, force: true });
  }

  console.log('\n🏁 Database Backup & Restore Drill process completed successfully.');
}

if (require.main === module) {
  runBackupAndRestoreDrill().catch((err) => {
    console.error('Fatal error during backup/restore drill:', err);
    process.exit(1);
  });
}
