import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import * as fs from 'fs';
import * as path from 'path';

let dbInstance: PGlite | null = null;
let dbDataDir: string | null = null;

function isCorruptedPGliteState(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Aborted()') || message.includes('RuntimeError: Aborted');
}

async function initializeDatabase(dataDir: string): Promise<PGlite> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const db = new PGlite({
        dataDir,
        extensions: { vector },
      });

      await db.exec('CREATE EXTENSION IF NOT EXISTS vector;');

      const migrationsPath = path.join(__dirname, '../prisma/migrations');
      if (fs.existsSync(migrationsPath)) {
        const migrationFiles = fs.readdirSync(migrationsPath)
          .sort()
          .flatMap((entry) => {
            const entryPath = path.join(migrationsPath, entry);
            if (fs.statSync(entryPath).isDirectory()) {
              return fs.readdirSync(entryPath)
                .filter((file) => file.endsWith('.sql'))
                .sort()
                .map((file) => path.join(entryPath, file));
            }
            return entry.endsWith('.sql') ? [entryPath] : [];
          });
        for (const migrationFile of migrationFiles) {
          const migrationSql = fs.readFileSync(migrationFile, 'utf8');
          await db.exec(migrationSql);
        }
      }

      return db;
    } catch (error) {
      if (attempt === 0 && isCorruptedPGliteState(error) && fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true, force: true });
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Failed to initialize PGlite at ${dataDir}`);
}

export async function getDatabase(dataDirOverride?: string): Promise<PGlite> {
  const dataDir = path.resolve(dataDirOverride ?? path.join(__dirname, '../.pglite-data'));

  if (!dbInstance || (dbDataDir && dbDataDir !== dataDir)) {
    dbInstance = await initializeDatabase(dataDir);
    dbDataDir = dataDir;
  }

  return dbInstance;
}
