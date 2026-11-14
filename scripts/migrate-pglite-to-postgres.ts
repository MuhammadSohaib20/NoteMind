import '../src/config/env';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import * as fs from 'fs';
import * as path from 'path';
import { closeDatabase, getDatabase, withTransactionOn } from '../src/db';

/**
 * One-time copy of an existing embedded PGlite database into PostgreSQL.
 *
 * Typical use after exporting the old Docker volume to ./backups/pglite-export:
 *
 *   npm run db:migrate-pglite -- --source=./backups/pglite-export
 *   npm run db:migrate-pglite -- --source=./backups/pglite-export --replace
 *
 * The target is DATABASE_URL. Migrations are applied first. Existing rows are
 * skipped by primary key unless --replace is given, in which case the target
 * tables are cleared first. The source database is only read.
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

interface Options {
  sourceDir: string;
  replace: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const sourceArg = argv.find((arg) => arg.startsWith('--source='));
  return {
    sourceDir: path.resolve(sourceArg ? sourceArg.slice('--source='.length) : '.pglite-data'),
    replace: argv.includes('--replace'),
    dryRun: argv.includes('--dry-run'),
  };
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function vectorParam(value: unknown): unknown {
  if (Array.isArray(value)) return `[${value.join(',')}]`;
  return value;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(options.sourceDir)) {
    throw new Error(
      `PGlite source directory not found: ${options.sourceDir}\n` +
        'Export the old Docker volume first (see DOCKER.md):\n' +
        '  docker run --rm -v notemind_pglite_data:/data:ro \\\n' +
        '    -v "$PWD/backups/pglite-export:/export" alpine sh -c "cp -a /data/. /export/"'
    );
  }

  console.log('🔄 PGlite -> PostgreSQL migration');
  console.log(`   Source: ${options.sourceDir}`);
  console.log(`   Mode:   ${options.dryRun ? 'dry run' : options.replace ? 'replace target rows' : 'insert missing rows'}\n`);

  const source = new PGlite(options.sourceDir, { extensions: { vector } });
  const target = await getDatabase();

  try {
    const sourceTables: Record<TableName, any[]> = {} as Record<TableName, any[]>;
    for (const table of TABLES) {
      const result = await source.query(`SELECT * FROM ${quoteIdent(table)};`);
      sourceTables[table] = result.rows;
      console.log(`   read ${table}: ${result.rows.length}`);
    }

    if (options.dryRun) {
      console.log('\nDry run complete; no rows were written.');
      return;
    }

    const inserted: Record<TableName, number> = {} as Record<TableName, number>;

    await withTransactionOn(target, async (client) => {
      if (options.replace) {
        // Order matters even with CASCADE; this also works on a fresh database.
        await client.query(
          `TRUNCATE ${TABLES.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE;`
        );
      }

      for (const table of TABLES) {
        inserted[table] = 0;
        for (const row of sourceTables[table]) {
          const columns = Object.keys(row);
          if (columns.length === 0) continue;

          const values = columns.map((column) =>
            column === 'embedding' ? vectorParam(row[column]) : row[column]
          );

          const result = await client.query(
            `INSERT INTO ${quoteIdent(table)} ` +
              `(${columns.map(quoteIdent).join(', ')}) ` +
              `VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) ` +
              `ON CONFLICT DO NOTHING;`,
            values
          );
          inserted[table] += result.rowCount ?? 0;
        }
      }
    });

    console.log('\n✅ Migration transaction committed.');
    for (const table of TABLES) {
      const targetCount = await target.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM ${quoteIdent(table)};`
      );
      console.log(
        `   ${table}: source=${sourceTables[table].length} inserted=${inserted[table]} target=${targetCount.rows[0]?.count ?? 0}`
      );
    }
  } finally {
    await source.close().catch(() => undefined);
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error('❌ PGlite migration failed:', error);
  process.exit(1);
});
