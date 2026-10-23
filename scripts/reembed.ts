import '../src/config/env';
import { getDatabase } from '../src/db';
import { aiConfig } from '../src/config/ai';
import { chunkText } from '../src/services/ai/chunker';
import { getEmbeddingProvider, hashContent } from '../src/services/ai';
import { replaceNoteEmbeddings } from '../src/services/ai/store';

/**
 * Backfills real semantic embeddings for every note.
 *
 * The previous implementation stored deterministic pseudo-vectors, so every
 * existing row has to be regenerated. Run this once after wiring up an
 * embedding provider:
 *
 *   npm run db:reembed
 *   npm run db:reembed -- --dry-run
 *   npm run db:reembed -- --user=<uuid> --limit=20
 *
 * Unchanged content is skipped, so the script is safe to re-run and cheap to
 * repeat after a model change (embeddings cached on disk are reused).
 */

interface Args {
  dryRun: boolean;
  userId?: string;
  limit?: number;
  includeTrashed: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, includeTrashed: false };

  for (const raw of argv) {
    if (raw === '--dry-run') args.dryRun = true;
    else if (raw === '--include-trashed') args.includeTrashed = true;
    else if (raw.startsWith('--user=')) args.userId = raw.slice('--user='.length);
    else if (raw.startsWith('--limit=')) args.limit = parseInt(raw.slice('--limit='.length), 10);
  }

  return args;
}

interface NoteRow {
  id: string;
  title: string;
  content: string;
  tagNames: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('==================================================');
  console.log('🧠 NoteMind Embedding Backfill');
  console.log('==================================================\n');

  const provider = getEmbeddingProvider();

  if (!provider) {
    console.error(
      '❌ No embedding provider configured.\n' +
        '   Set GEMINI_API_KEY in .env (free tier, no credit card required):\n' +
        '   https://aistudio.google.com/apikey\n'
    );
    process.exit(1);
  }

  console.log(`   Model:       ${provider.model}`);
  console.log(`   Dimensions:  ${provider.dimensions}`);
  console.log(`   Rate limit:  ${aiConfig.maxRpm} requests/minute`);
  console.log(`   Cache dir:   ${aiConfig.cacheDir}`);
  if (args.dryRun) console.log('   Mode:        DRY RUN (no writes)');
  console.log('');

  const db = await getDatabase();

  const params: any[] = [];
  const conditions: string[] = [];

  if (!args.includeTrashed) {
    conditions.push('n.deleted_at IS NULL');
  }
  if (args.userId) {
    params.push(args.userId);
    conditions.push(`n.user_id = $${params.length}`);
  }

  let sql = `
    SELECT n.id, n.title, n.content,
           COALESCE(string_agg(DISTINCT t.name, ','), '') AS "tagNames"
    FROM "notes" n
    LEFT JOIN "note_tags" nt ON nt.note_id = n.id
    LEFT JOIN "tags" t ON t.id = nt.tag_id
  `;

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' GROUP BY n.id, n.title, n.content';

  if (args.limit && args.limit > 0) {
    params.push(args.limit);
    sql += ` LIMIT $${params.length}`;
  }

  const result = await db.query(sql, params);
  const notes = result.rows as NoteRow[];

  console.log(`📚 Found ${notes.length} note(s) to process.\n`);

  if (notes.length === 0) {
    console.log('✅ Nothing to do.');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let totalChunks = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const tags = note.tagNames ? note.tagNames.split(',').filter(Boolean) : [];
    const chunks = chunkText(note.content);
    const expectedHashes = chunks.map((chunk) => hashContent(chunk.content));

    // Skip when the stored embeddings already match this content.
    const existing = await db.query(
      `SELECT content_hash FROM "note_embeddings" WHERE note_id = $1 AND embedding_model = $2;`,
      [note.id, provider.model]
    );
    const storedHashes = (existing.rows as any[]).map((row) => row.content_hash).filter(Boolean);
    const isCurrent =
      storedHashes.length === expectedHashes.length &&
      expectedHashes.every((hash) => storedHashes.includes(hash));

    if (isCurrent) {
      skipped++;
      console.log(`   [${i + 1}/${notes.length}] ⏭  up to date - "${note.title}"`);
      continue;
    }

    if (args.dryRun) {
      console.log(`   [${i + 1}/${notes.length}] 🔍 would embed - "${note.title}" (${chunks.length} chunk(s))`);
      updated++;
      continue;
    }

    const sync = await replaceNoteEmbeddings(db, note.id, {
      title: note.title,
      content: note.content,
      tags,
    });

    if (sync.error) {
      failed++;
      failures.push({ id: note.id, error: sync.error });
      console.log(`   [${i + 1}/${notes.length}] ❌ failed   - "${note.title}": ${sync.error}`);
      continue;
    }

    updated++;
    totalChunks += sync.chunks;
    console.log(`   [${i + 1}/${notes.length}] ✅ embedded - "${note.title}" (${sync.chunks} chunk(s))`);
  }

  console.log('\n==================================================');
  console.log('📊 Backfill Summary');
  console.log('==================================================');
  console.log(`   Notes updated:  ${updated}`);
  console.log(`   Notes skipped:  ${skipped} (already current)`);
  console.log(`   Notes failed:   ${failed}`);
  console.log(`   Chunks written: ${totalChunks}`);
  console.log(`   Model:          ${provider.model} (${provider.dimensions} dims)`);

  if (failures.length > 0) {
    console.log('\n   Failures:');
    for (const failure of failures.slice(0, 10)) {
      console.log(`     - ${failure.id}: ${failure.error}`);
    }
    if (failures.length > 10) {
      console.log(`     ... and ${failures.length - 10} more`);
    }
  }

  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  });
