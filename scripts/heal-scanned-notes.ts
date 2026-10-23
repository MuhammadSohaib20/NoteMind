/**
 * Heal notes that still hold an upload placeholder instead of real text.
 *
 * Scanned PDFs and images uploaded before OCR was wired in have a stub like
 * `[Uploaded Scanned PDF Document: "Chp 2 - Planning.pdf"]` as their content,
 * so the AI could never answer from them. This script re-runs extraction (now
 * with OCR) against the stored original file.
 *
 *   npm run db:ocr-heal             # DRY RUN: show what would be extracted
 *   npm run db:ocr-heal -- --apply  # write the text + re-embed the notes
 *
 * With --apply, each healed note is re-embedded through the normal provider
 * chain. If an embed call fails (e.g. no network), the note content is still
 * healed and its stale placeholder embeddings are dropped — run
 * `npm run db:reembed` afterwards to finish.
 */

import 'dotenv/config';
import { getDatabase } from '../src/db';
import {
  extractTextFromFile,
  isPlaceholderContent,
  dataUrlToBuffer,
} from '../src/controllers/notes.controller';
import { getEmbeddingProvider } from '../src/services/ai';
import { replaceNoteEmbeddings } from '../src/services/ai/store';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  console.log(`\nScanned-note OCR heal — ${apply ? 'APPLY mode' : 'dry run (add --apply to write)'}\n`);

  const db = await getDatabase();
  const result = await db.query(
    `SELECT id, user_id as "userId", title, content,
            file_name as "fileName", file_type as "fileType", file_data as "fileData"
     FROM "notes"
     WHERE deleted_at IS NULL AND file_data IS NOT NULL
     ORDER BY updated_at DESC;`
  );

  const placeholders = (result.rows as any[]).filter((row) => isPlaceholderContent(row.content));
  console.log(`Found ${(result.rows as any[]).length} notes with a stored file, ` +
    `${placeholders.length} still holding a placeholder.\n`);

  if (placeholders.length === 0) {
    console.log('Nothing to heal.');
    return;
  }

  const provider = getEmbeddingProvider();
  const stats = { healed: 0, noText: 0, unreadable: 0, embedded: 0, embedFailed: 0 };
  for (const note of placeholders) {
    const buffer = dataUrlToBuffer(note.fileData || '');
    if (!buffer) {
      stats.unreadable++;
      console.log(`  ✗ "${note.title}" — stored file data unreadable, skipped`);
      continue;
    }

    const text = await extractTextFromFile({
      buffer,
      originalname: note.fileName || 'uploaded-file',
      mimetype: note.fileType || '',
    } as Express.Multer.File).catch(() => '');

    const looksReal =
      !!text &&
      !text.startsWith('[Uploaded ') &&
      !text.startsWith('(No extractable text content found');

    if (!looksReal) {
      stats.noText++;
      console.log(`  ✗ "${note.title}" — OCR produced no text (unsupported/unreadable file)`);
      continue;
    }

    const preview = text.replace(/\s+/g, ' ').slice(0, 160);
    console.log(`  ✓ "${note.title}" — ${text.length} chars extracted:`);
    console.log(`      "${preview}${text.length > 160 ? '...' : ''}"`);

    if (!apply) continue;

    stats.healed++;
    await db.query(`UPDATE "notes" SET content = $1 WHERE id = $2;`, [text, note.id]);

    if (!provider) {
      await db.query(`DELETE FROM "note_embeddings" WHERE note_id = $1;`, [note.id]);
      console.log('        content saved (no AI key — run `npm run db:reembed` to embed)');
      continue;
    }

    const tagRes = await db.query(
      `SELECT t.name FROM "note_tags" nt JOIN "tags" t ON t.id = nt.tag_id WHERE nt.note_id = $1;`,
      [note.id]
    );
    const sync = await replaceNoteEmbeddings(db, note.id, {
      title: note.title,
      content: text,
      tags: (tagRes.rows as any[]).map((r) => r.name),
    });

    if (sync.error) {
      await db.query(`DELETE FROM "note_embeddings" WHERE note_id = $1;`, [note.id]);
      stats.embedFailed++;
      console.log(`        content saved, embed failed (${sync.error}) — run \`npm run db:reembed\``);
    } else {
      stats.embedded++;
      console.log(`        indexed: ${sync.chunks} chunk(s)`);
    }
  }

  console.log(
    `\nSummary: ${stats.healed} healed` +
      (apply ? `, ${stats.embedded} embedded, ${stats.embedFailed} embed retry needed` : '') +
      `, ${stats.noText} with no readable text, ${stats.unreadable} unreadable` +
      (apply ? '' : ` — ${placeholders.length} would be processed (run with --apply)`) +
      '\n'
  );
  if (apply && (stats.embedFailed > 0 || !provider)) {
    console.log('\nHealed notes are saved but not yet embedded — run `npm run db:reembed`');
    console.log('(or tick them in the AI Index panel) so the assistant can search them.\n');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('OCR heal failed:', err);
    process.exit(1);
  });
