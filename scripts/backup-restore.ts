import '../src/config/env';
import { Client, Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import {
  closeDatabase,
  runMigrations,
  withTransaction,
  withTransactionOn,
} from '../src/db';

/**
 * Logical backup + restore drill.
 *
 * 1. Takes a transactionally consistent snapshot (REPEATABLE READ, READ ONLY)
 *    of every application table and writes it to `backups/backup_*.json`.
 * 2. Creates a throwaway PostgreSQL database, applies the real migrations to it,
 *    restores every row, and compares row counts with the source.
 * 3. Drops the throwaway database.
 *
 * The snapshot is a portable logical backup; for production, `pg_dump` is still
 * the preferred mechanism for large databases and point-in-time recovery.
 * The throwaway database approach means the drill never touches live tables.
 */

const TABLES = [
  'users',
  'collections',
  'notes',
  'tags',
  'note_tags',
  'note_embeddings',
] as const;

type TableName = (typeof TABLES)[number];

interface BackupData {
  timestamp: string;
  tables: Record<TableName, any[]>;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is not set; cannot run the backup/restore drill.');
  }
  return url;
}

function adminConnectionString(): string {
  const url = new URL(requireDatabaseUrl());
  // `postgres` is the maintenance database in the official image and in most
  // managed providers. CREATE/DROP DATABASE must run outside the target DB.
  url.pathname = '/postgres';
  return url.toString();
}

function databaseConnectionString(databaseName: string): string {
  const url = new URL(requireDatabaseUrl());
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createDatabase(databaseName: string): Promise<void> {
  const admin = new Client({ connectionString: adminConnectionString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteIdent(databaseName)};`);
  } finally {
    await admin.end();
  }
}

async function dropDatabase(databaseName: string): Promise<void> {
  const admin = new Client({ connectionString: adminConnectionString() });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid();`,
      [databaseName]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)};`);
  } finally {
    await admin.end();
  }
}

async function readSnapshot(): Promise<BackupData> {
  const tables = {} as Record<TableName, any[]>;

  await withTransaction(
    async (client) => {
      for (const table of TABLES) {
        const result = await client.query(`SELECT * FROM ${quoteIdent(table)};`);
        tables[table] = result.rows;
      }
    },
    { isolation: 'REPEATABLE READ', readOnly: true }
  );

  return { timestamp: new Date().toISOString(), tables };
}

async function insertRows(
  client: PoolClient,
  table: TableName,
  rows: any[]
): Promise<void> {
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;

    const sql =
      `INSERT INTO ${quoteIdent(table)} ` +
      `(${columns.map(quoteIdent).join(', ')}) ` +
      `VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')});`;

    await client.query(sql, columns.map((column) => row[column]));
  }
}

async function countRows(pool: Pool, table: TableName): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM ${quoteIdent(table)};`
  );
  return result.rows[0]?.count ?? 0;
}

export async function runBackupAndRestoreDrill(): Promise<void> {
  console.log('📦 Starting Database Backup Strategy & Restore Drill...\n');

  const snapshot = await readSnapshot();
  const backupDir = path.join(__dirname, '../backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const backupFilePath = path.join(backupDir, `backup_${Date.now()}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log(`1️⃣ Snapshot written to: ${backupFilePath}`);
  for (const table of TABLES) {
    console.log(`   - ${table}: ${snapshot.tables[table].length}`);
  }
  console.log(
    '   ⚠️  The snapshot contains password hashes, note content and embeddings. Treat it as sensitive.\n'
  );

  const restoreDatabase = `notemind_restore_${Date.now()}`;
  let restorePool: Pool | null = null;

  try {
    console.log(`2️⃣ Creating isolated restore database "${restoreDatabase}"...`);
    await createDatabase(restoreDatabase);

    restorePool = new Pool({
      connectionString: databaseConnectionString(restoreDatabase),
      max: 2,
      application_name: 'notemind-restore-drill',
    });

    await runMigrations(restorePool);

    await withTransactionOn(restorePool, async (client) => {
      for (const table of TABLES) {
        await insertRows(client, table, snapshot.tables[table]);
      }
    });

    console.log('3️⃣ Verifying restored data...');
    let ok = true;
    for (const table of TABLES) {
      const expected = snapshot.tables[table].length;
      const actual = await countRows(restorePool, table);
      const match = actual === expected;
      ok &&= match;
      console.log(`   - ${table}: ${actual} / ${expected} ${match ? '✅' : '❌'}`);
    }

    if (!ok) {
      throw new Error('Restore drill verification failed: row count mismatch.');
    }

    console.log('\n🎉 RESTORE DRILL VERIFICATION PASSED 100%!');
  } finally {
    if (restorePool) {
      await restorePool.end().catch(() => undefined);
    }
    await dropDatabase(restoreDatabase).catch((error) => {
      console.warn(
        `⚠️  Could not drop the temporary restore database "${restoreDatabase}":`,
        error instanceof Error ? error.message : error
      );
    });
  }

  console.log('\n🏁 Database Backup & Restore Drill completed successfully.');
}

if (require.main === module) {
  runBackupAndRestoreDrill()
    .then(async () => {
      await closeDatabase();
    })
    .catch(async (error) => {
      console.error('Fatal error during backup/restore drill:', error);
      await closeDatabase();
      process.exit(1);
    });
}
