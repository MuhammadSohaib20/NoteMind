import './config/env';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PostgreSQL access layer.
 *
 * The application talks to a normal PostgreSQL 16 + pgvector server through a
 * connection pool. Every query goes through `pool.query`, and code that needs
 * more than one statement to be atomic uses `withTransaction` so the statements
 * are pinned to the same pooled connection.
 *
 * Migrations are the SQL files under `prisma/migrations`. Each file is applied
 * exactly once and recorded in `schema_migrations` together with a checksum, so
 * two app instances can boot safely and an accidentally edited migration fails
 * loudly instead of silently drifting.
 */

export type Database = Pool;

export interface TransactionOptions {
  isolation?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  readOnly?: boolean;
}

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

let dbPromise: Promise<Pool> | null = null;

// Stable application-wide key for pg_advisory_lock. Any value works as long as
// every NoteMind instance uses the same one.
const MIGRATION_LOCK_KEY = 0x4e4f5445; // "NOTE"

function resolveMigrationsDir(): string {
  const candidates = [
    // dist/db.js -> <app>/prisma/migrations (container and production build)
    path.join(__dirname, '../prisma/migrations'),
    // ts-node src/db.ts -> <repo>/prisma/migrations
    path.join(__dirname, '../../prisma/migrations'),
    // last resort for unusual working directories
    path.join(process.cwd(), 'prisma/migrations'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `Database migrations directory not found. Looked in: ${candidates.join(', ')}`
    );
  }
  return found;
}

function loadMigrations(): MigrationFile[] {
  const migrationsDir = resolveMigrationsDir();

  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sqlPath = path.join(migrationsDir, entry.name, 'migration.sql');
      if (!fs.existsSync(sqlPath)) {
        throw new Error(`Migration "${entry.name}" is missing migration.sql`);
      }
      const sql = fs.readFileSync(sqlPath, 'utf8');
      return {
        name: entry.name,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

async function applyMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "name" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const applied = await client.query<{ name: string; checksum: string }>(
    `SELECT "name", "checksum" FROM "schema_migrations";`
  );
  const appliedByName = new Map(applied.rows.map((row) => [row.name, row.checksum]));
  const migrations = loadMigrations();

  for (const migration of migrations) {
    const previousChecksum = appliedByName.get(migration.name);

    if (previousChecksum) {
      if (previousChecksum !== migration.checksum) {
        throw new Error(
          `Migration "${migration.name}" has changed after it was applied. ` +
            'Create a new migration instead of editing an applied one.'
        );
      }
      continue;
    }

    await client.query('BEGIN');
    try {
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO "schema_migrations" ("name", "checksum") VALUES ($1, $2);`,
        [migration.name, migration.checksum]
      );
      await client.query('COMMIT');
      console.log(`[db] applied migration ${migration.name}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration "${migration.name}" failed: ${message}`);
    }
  }
}

/**
 * Applies pending migrations on a specific pool. Exported for tooling (the
 * backup/restore drill builds a throwaway database and migrates it too).
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1);', [MIGRATION_LOCK_KEY]);

    // pgvector lives in the database, not in a schema owned by this app. The
    // official image ships it; managed providers usually enable it once.
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The pgvector extension is required but could not be enabled: ${message}. ` +
          'Use a PostgreSQL image/provider with pgvector support and grant the app user permission to create extensions.'
      );
    }

    await applyMigrations(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1);', [MIGRATION_LOCK_KEY]).catch(
      () => undefined
    );
    client.release();
  }
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Start PostgreSQL (for example `docker compose up -d db`) ' +
        'and put its connection string in .env.'
    );
  }

  const configuredMax = Number.parseInt(process.env.DB_POOL_MAX ?? '10', 10);
  const max = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 10;

  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'notemind-api',
  });

  pool.on('error', (error) => {
    // An idle pooled client failed (network reset, server restart). The pool
    // discards it; log enough to diagnose without crashing the process.
    console.error('[db] idle PostgreSQL client error:', error.message);
  });

  return pool;
}

/**
 * Returns the process-wide pool, running migrations on first use.
 */
export function getDatabase(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const pool = createPool();
      try {
        await runMigrations(pool);
        return pool;
      } catch (error) {
        await pool.end().catch(() => undefined);
        throw error;
      }
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

/**
 * Runs `fn` on one connection from `db` inside a transaction. Commits on
 * success, rolls back on any error, and always returns the connection to the
 * pool.
 *
 * Use this variant when a helper receives a specific pool (for example a
 * throwaway database created by the backup drill).
 */
export async function withTransactionOn<T>(
  db: Database,
  fn: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const client = await db.connect();
  const isolation = options.isolation ?? 'READ COMMITTED';
  const begin = `BEGIN ISOLATION LEVEL ${isolation}${options.readOnly ? ' READ ONLY' : ''}`;

  try {
    await client.query(begin);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` on one pooled connection inside a transaction. Commits on success,
 * rolls back on any error, and always returns the connection to the pool.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const db = await getDatabase();
  return withTransactionOn(db, fn, options);
}

/**
 * Lightweight readiness probe used by `/health`. It deliberately does not run
 * migrations or hold a connection.
 */
export async function checkDatabaseHealth(): Promise<void> {
  const db = await getDatabase();
  const result: QueryResult<QueryResultRow> = await db.query('SELECT 1;');
  if (result.rows.length !== 1) {
    throw new Error('Unexpected database health-check response');
  }
}

/**
 * Closes the pool. Called on SIGTERM/SIGINT and by short-lived scripts so the
 * process exits cleanly instead of waiting for idle clients.
 */
export async function closeDatabase(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;

  try {
    const pool = await pending;
    await pool.end();
  } catch {
    // Initialization already closed its pool on failure.
  }
}
