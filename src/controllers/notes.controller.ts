import { Response, NextFunction } from 'express';
import { z } from 'zod';
import mammoth from 'mammoth';
import { getDatabase } from '../db';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { MAX_NOTE_FILE_SIZE_BYTES } from '../constants/noteFiles';
import { getEmbeddingProvider, chunkText, hashContent } from '../services/ai';
import { replaceNoteEmbeddings, noteEmbeddingsAreCurrent } from '../services/ai/store';
import { ocrScannedPdfBuffer, ocrImageBuffer } from '../services/pdfOcr';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

/**
 * Returns the ids of notes whose stored embeddings exactly match what the user
 * would index right now (same active model, same chunk hashes). This makes the
 * `indexed` flag self-healing: an edited note automatically shows as
 * unindexed instead of the assistant silently answering from stale content.
 */
async function getIndexedNoteIds(
  db: any,
  notes: Array<{ id: string; content?: string | null }>
): Promise<Set<string>> {
  const provider = getEmbeddingProvider();
  const result = new Set<string>();
  if (!provider || notes.length === 0) return result;

  const stored = await db.query(
    `SELECT note_id, content_hash FROM "note_embeddings"
     WHERE note_id = ANY($1::uuid[]) AND embedding_model = $2;`,
    [notes.map((n) => n.id), provider.model]
  );

  const hashesByNote = new Map<string, Set<string>>();
  for (const row of stored.rows as any[]) {
    if (!row.content_hash) continue;
    let hashes = hashesByNote.get(row.note_id);
    if (!hashes) {
      hashes = new Set<string>();
      hashesByNote.set(row.note_id, hashes);
    }
    hashes.add(row.content_hash);
  }

  for (const note of notes) {
    // A note whose "content" is only an upload placeholder (scanned file that
    // could not be read yet) is never considered indexed — otherwise the UI
    // would show it as Ready and nobody would ever trigger the OCR self-heal.
    if (isPlaceholderContent(note.content)) continue;

    const expected = chunkText(note.content || '').map((c) => hashContent(c.content));
    if (expected.length === 0) continue;
    const storedHashes = hashesByNote.get(note.id) ?? new Set<string>();
    if (expected.length === storedHashes.size && expected.every((h) => storedHashes.has(h))) {
      result.add(note.id);
    }
  }
  return result;
}

/**
 * OCR an uploaded image (scanned page photo, screenshot, ...) with the same
 * shared, local-first tesseract worker the scanned-PDF path uses.
 */
async function performOcrOnBuffer(buffer: Buffer): Promise<string> {
  try {
    return await ocrImageBuffer(buffer);
  } catch (err) {
    console.error('OCR Extraction Error:', err);
    return '';
  }
}

export async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
  const fileExt = file.originalname.split('.').pop()?.toLowerCase() || '';
  const mime = file.mimetype || '';

  let extractedText = '';

  if (fileExt === 'docx' || fileExt === 'doc' || fileExt === 'odt' || fileExt === 'odf') {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = result.value ? result.value.trim() : '';
    } catch (err) {
      console.error('Document text extraction error:', err);
      extractedText = '';
    }
  } else if (fileExt === 'pdf') {
    try {
      const pdfData = await pdfParse(file.buffer);
      extractedText = pdfData && pdfData.text ? pdfData.text.trim() : '';
    } catch (err) {
      console.error('PDF parsing error:', err);
      extractedText = '';
    }

    const cleanText = extractedText
      .replace(/Scanned with CamScanner/gi, '')
      .replace(/CamScanner/gi, '')
      .trim();

    if (cleanText.replace(/\s+/g, '').length > 0) {
      extractedText = cleanText;
    } else {
      // No text layer at all → this is a scanned PDF. Render the pages to
      // images and run OCR so the AI can actually answer from its content.
      // Runs entirely inside Node (pdfjs rasterises, tesseract.js recognises).
      const ocrText = (await ocrScannedPdfBuffer(file.buffer))
        .replace(/Scanned with CamScanner/gi, '')
        .replace(/CamScanner/gi, '')
        .trim();
      extractedText =
        ocrText.replace(/\s+/g, '').length > 0
          ? ocrText
          : `[Uploaded Scanned PDF Document: "${file.originalname}"]`;
    }
  } else if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'tiff', 'gif', 'svg'].includes(fileExt)) {
    extractedText = await performOcrOnBuffer(file.buffer);
    if (!extractedText || extractedText.trim().length === 0) {
      extractedText = `[Uploaded Scanned Image: "${file.originalname}"]`;
    }
  } else {
    try {
      extractedText = file.buffer.toString('utf-8').trim();
    } catch {
      extractedText = '';
    }
  }

  if (!extractedText || extractedText.trim().length === 0) {
    extractedText = `(No extractable text content found in uploaded file "${file.originalname}")`;
  }

  // PostgreSQL text columns reject NUL (0x00). Binary files read as UTF-8 can
  // contain them and would otherwise fail the insert with a 500.
  return extractedText.replace(new RegExp(String.fromCharCode(0), 'g'), '');
}

/**
 * True when a note's stored "content" is only the placeholder written by an
 * upload that could not extract any real text (a scanned PDF from before OCR
 * was wired in, an image whose OCR failed, ...). Indexing re-runs extraction
 * for these notes so they become searchable without re-uploading.
 */
export function isPlaceholderContent(content: string | null | undefined): boolean {
  if (!content) return true;
  const trimmed = content.trim();
  // Matches every stub shape this app has ever written, including legacy ones:
  //   [Uploaded Scanned PDF Document: "x.pdf"]
  //   [Uploaded PDF document: "x.pdf"]
  //   [Uploaded Scanned Image: "x.jpg"]
  //   [Uploaded File: "x.docx"]
  return (
    /^\[Uploaded [^"\]]+: "[^"]+"\]$/.test(trimmed) ||
    trimmed.startsWith('(No extractable text content found')
  );
}

export function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:([^;,]+)?;base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}

function normalizeTags(rawTags: unknown): string[] {
  if (!rawTags) return [];
  let list: string[] = [];
  if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) {
        list = parsed.map(String);
      } else {
        list = rawTags.split(',');
      }
    } catch {
      list = rawTags.split(',');
    }
  } else if (Array.isArray(rawTags)) {
    for (const item of rawTags) {
      if (typeof item === 'string') {
        list.push(...item.split(','));
      } else if (item && typeof item === 'object' && 'name' in item) {
        list.push(String((item as any).name));
      }
    }
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    const cleaned = raw.trim().replace(/^#+/, '').trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(cleaned);
    }
  }
  return result;
}

const collectionIdSchema = z
  .union([z.string().uuid(), z.literal(''), z.null()])
  .transform((val) => (val && typeof val === 'string' && val.trim() !== '' ? val : null))
  .optional();

export const createNoteSchema = z.object({
  body: z.object({
    collectionId: collectionIdSchema,
    title: z.string().min(1, 'Title is required').max(255),
    content: z.string().min(1, 'Content is required'),
    tags: z.array(z.string()).optional(),
    fileName: z.string().optional(),
    fileType: z.string().optional(),
    fileData: z.string().optional(),
    filePreview: z.string().optional(),
  }),
});

export const updateNoteSchema = z.object({
  body: z.object({
    collectionId: collectionIdSchema,
    title: z.string().min(1).max(255).optional(),
    content: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    fileName: z.string().optional(),
    fileType: z.string().optional(),
    fileData: z.string().optional(),
    filePreview: z.string().optional(),
  }),
});

export const indexNotesSchema = z.object({
  body: z.object({
    noteIds: z
      .array(z.string().uuid('Invalid note id'))
      .min(1, 'Select at least one note')
      .max(50, 'Index up to 50 notes at a time'),
    force: z.boolean().optional(),
  }),
});

export async function listNotes(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { collectionId, generalOnly, tag, search, cursor, limit = '50' } = req.query as {
      collectionId?: string;
      generalOnly?: string;
      tag?: string;
      search?: string;
      cursor?: string;
      limit?: string;
    };

    const pageSize = parseInt(limit, 10) || 50;
    const db = await getDatabase();

    let query = `
      SELECT n.id, n.user_id as "userId", n.collection_id as "collectionId",
             n.title, n.content, n.file_name as "fileName", n.file_type as "fileType",
             n.file_preview as "filePreview",
             n.created_at as "createdAt", n.updated_at as "updatedAt",
             c.name as "collectionName",
             COALESCE(string_agg(DISTINCT t.name, ','), '') as "tagNames"
      FROM "notes" n
      LEFT JOIN "collections" c ON c.id = n.collection_id
      LEFT JOIN "note_tags" nt ON nt.note_id = n.id
      LEFT JOIN "tags" t ON t.id = nt.tag_id
      WHERE n.user_id = $1 AND n.deleted_at IS NULL
    `;

    const params: any[] = [userId];

    if (generalOnly === 'true') {
      query += ' AND n.collection_id IS NULL';
    } else if (collectionId) {
      params.push(collectionId);
      query += ` AND n.collection_id = $${params.length}`;
    }

    if (tag && tag.trim() !== '') {
      const cleanTag = tag.trim().replace(/^#+/, '').trim();
      params.push(cleanTag);
      query += ` AND EXISTS (
        SELECT 1 FROM "note_tags" nt_f
        JOIN "tags" t_f ON t_f.id = nt_f.tag_id
        WHERE nt_f.note_id = n.id AND LOWER(t_f.name) = LOWER($${params.length})
      )`;
    }

    if (search && search.trim() !== '') {
      const rawSearch = search.trim();
      const tagSearch = rawSearch.replace(/^#+/, '').trim();
      params.push(`%${rawSearch}%`);
      const textParamIdx = params.length;
      params.push(`%${tagSearch}%`);
      const tagParamIdx = params.length;

      query += ` AND (
        n.title ILIKE $${textParamIdx}
        OR n.content ILIKE $${textParamIdx}
        OR COALESCE(c.name, '') ILIKE $${textParamIdx}
        OR EXISTS (
          SELECT 1 FROM "note_tags" nt_s
          JOIN "tags" t_s ON t_s.id = nt_s.tag_id
          WHERE nt_s.note_id = n.id AND t_s.name ILIKE $${tagParamIdx}
        )
      )`;
    }

    if (cursor) {
      params.push(cursor);
      query += ` AND n.created_at < (SELECT created_at FROM "notes" WHERE id = $${params.length})`;
    }

    query += ` GROUP BY n.id, c.name ORDER BY n.updated_at DESC, n.created_at DESC LIMIT $${params.length + 1};`;
    params.push(pageSize + 1);

    const result = await db.query(query, params);
    const rows = result.rows as any[];

    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    const formattedData = data.map((n) => ({
      ...n,
      tags: n.tagNames ? n.tagNames.split(',').filter(Boolean) : [],
    }));
    const indexedIds = await getIndexedNoteIds(db, formattedData);
    for (const note of formattedData) {
      note.indexed = indexedIds.has(note.id);
    }

    return res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        nextCursor,
        hasMore,
      },
    });
  } catch (error: any) {
    next(error);
  }
}

export async function listTrashedNotes(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const db = await getDatabase();
    const result = await db.query(
      `SELECT n.id, n.user_id as "userId", n.collection_id as "collectionId",
              n.title, n.content, n.file_name as "fileName", n.file_type as "fileType",
              n.file_preview as "filePreview", n.created_at as "createdAt", n.updated_at as "updatedAt",
              c.name as "collectionName",
              COALESCE(string_agg(DISTINCT t.name, ','), '') as "tagNames"
       FROM "notes" n
       LEFT JOIN "collections" c ON c.id = n.collection_id
       LEFT JOIN "note_tags" nt ON nt.note_id = n.id
       LEFT JOIN "tags" t ON t.id = nt.tag_id
       WHERE n.user_id = $1 AND n.deleted_at IS NOT NULL
       GROUP BY n.id, c.name
       ORDER BY n.deleted_at DESC;`,
      [req.user!.id]
    );

    const data = result.rows.map((note: any) => ({
      ...note,
      tags: note.tagNames ? note.tagNames.split(',').filter(Boolean) : [],
    }));
    const indexedIds = await getIndexedNoteIds(db, data);
    for (const note of data) {
      note.indexed = indexedIds.has(note.id);
    }

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    next(error);
  }
}

export async function getNoteById(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const db = await getDatabase();

    const result = await db.query(
      `SELECT n.id, n.user_id as "userId", n.collection_id as "collectionId",
              n.title, n.content, n.file_name as "fileName", n.file_type as "fileType", n.file_data as "fileData",
              n.file_preview as "filePreview",
              n.created_at as "createdAt", n.updated_at as "updatedAt",
              c.name as "collectionName",
              COALESCE(string_agg(DISTINCT t.name, ','), '') as "tagNames"
       FROM "notes" n
       LEFT JOIN "collections" c ON c.id = n.collection_id
       LEFT JOIN "note_tags" nt ON nt.note_id = n.id
       LEFT JOIN "tags" t ON t.id = nt.tag_id
       WHERE n.id = $1 AND n.user_id = $2 AND n.deleted_at IS NULL
       GROUP BY n.id, c.name;`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Note not found or access denied' },
      });
    }

    const note = result.rows[0] as any;
    note.tags = note.tagNames ? note.tagNames.split(',').filter(Boolean) : [];
    note.indexed = (await getIndexedNoteIds(db, [note])).has(note.id);

    return res.status(200).json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function getNoteFile(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const db = await getDatabase();
    const result = await db.query(
      `SELECT file_name as "fileName", file_type as "fileType", file_data as "fileData"
       FROM "notes"
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0 || !(result.rows[0] as any).fileData) {
      return res.status(404).json({
        success: false,
        error: { message: 'Original file not found for this note' },
      });
    }

    const { fileName, fileType, fileData } = result.rows[0] as {
      fileName: string;
      fileType: string | null;
      fileData: string;
    };
    const dataUrl = /^data:([^;,]+)?;base64,([\s\S]*)$/.exec(fileData);

    if (!dataUrl) {
      return res.status(500).json({
        success: false,
        error: { message: 'Stored file data is invalid' },
      });
    }

    const fileMime = fileName.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : dataUrl[1] || fileType || 'application/octet-stream';
    const fileBuffer = Buffer.from(dataUrl[2], 'base64');

    res.setHeader('Content-Type', fileMime);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', 'inline');
    return res.status(200).send(fileBuffer);
  } catch (error: any) {
    next(error);
  }
}

export async function createNote(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  const db = await getDatabase();
  try {
    const userId = req.user!.id;
    const { collectionId, title, content, tags = [], fileName, fileType, fileData, filePreview } = req.body;
    const cleanTags = normalizeTags(tags);

    await db.query('BEGIN;');

    const result = await db.query(
      `INSERT INTO "notes" (user_id, collection_id, title, content, file_name, file_type, file_data, file_preview)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id as "userId", collection_id as "collectionId", title, content,
                 file_name as "fileName", file_type as "fileType", file_data as "fileData", file_preview as "filePreview",
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [userId, collectionId || null, title, content, fileName || null, fileType || null, fileData || null, filePreview || null]
    );

    const note = result.rows[0] as any;

    for (const cleanTag of cleanTags) {
      const tagRes = await db.query(
        `INSERT INTO "tags" (user_id, name) VALUES ($1, $2)
         ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id;`,
        [userId, cleanTag]
      );
      const tagId = (tagRes.rows[0] as any).id;

      await db.query(
        `INSERT INTO "note_tags" (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
        [note.id, tagId]
      );
    }

    if (collectionId) {
      const colRes = await db.query(`SELECT name FROM "collections" WHERE id = $1;`, [collectionId]);
      if (colRes.rows.length > 0) {
        note.collectionName = (colRes.rows[0] as any).name;
      }
    }

    await db.query('COMMIT;');

    // Indexing for AI search is now explicit: the user picks which notes the
    // assistant may see via POST /notes/index. This keeps API usage (and the
    // free-tier budget) fully under the user's control.
    note.indexed = false;
    note.tags = cleanTags;

    return res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    await db.query('ROLLBACK;').catch(() => {});
    next(error);
  }
}

export async function uploadNoteFile(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  const db = await getDatabase();
  try {
    const userId = req.user!.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: { message: 'No file uploaded' },
      });
    }

    const { collectionId, tags: tagsJson } = req.body;
    const tagsList = normalizeTags(tagsJson);

    const fileExt = file.originalname.split('.').pop()?.toLowerCase() || '';
    const noteTitle = file.originalname.replace(/\.[^/.]+$/, '');

    let extractedText = '';
    try {
      extractedText = await extractTextFromFile(file);
    } catch (err: any) {
      console.error('File text extraction error:', err);
      extractedText = `[Uploaded File: "${file.originalname}"]`;
    }
    let filePreview: string | null = null;
    if (fileExt === 'docx') {
      try {
        const converted = await mammoth.convertToHtml({ buffer: file.buffer });
        filePreview = converted.value;
      } catch (error) {
        console.error('Document preview conversion error:', error);
      }
    }

    if (fileExt && !tagsList.some((t) => t.toLowerCase() === fileExt.toLowerCase())) {
      tagsList.push(fileExt);
    }

    const fileMime = fileExt === 'pdf' ? 'application/pdf' : file.mimetype || 'application/octet-stream';
    let fileDataUrl: string | null = null;
    if (file.buffer && file.buffer.length <= MAX_NOTE_FILE_SIZE_BYTES) {
      try {
        fileDataUrl = `data:${fileMime};base64,${file.buffer.toString('base64')}`;
      } catch {
        fileDataUrl = null;
      }
    }

    await db.query('BEGIN;');

    const result = await db.query(
      `INSERT INTO "notes" (user_id, collection_id, title, content, file_name, file_type, file_data, file_preview)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id as "userId", collection_id as "collectionId", title, content,
                 file_name as "fileName", file_type as "fileType", file_preview as "filePreview",
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [userId, collectionId || null, noteTitle, extractedText, file.originalname, fileMime, fileDataUrl, filePreview]
    );

    const note = result.rows[0] as any;

    for (const cleanTag of tagsList) {
      const tagRes = await db.query(
        `INSERT INTO "tags" (user_id, name) VALUES ($1, $2)
         ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id;`,
        [userId, cleanTag]
      );
      const tagId = (tagRes.rows[0] as any).id;

      await db.query(
        `INSERT INTO "note_tags" (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
        [note.id, tagId]
      );
    }

    if (collectionId) {
      const colRes = await db.query(`SELECT name FROM "collections" WHERE id = $1;`, [collectionId]);
      if (colRes.rows.length > 0) {
        note.collectionName = (colRes.rows[0] as any).name;
      }
    }

    await db.query('COMMIT;');

    // Indexing for AI is explicit now; see createNote.
    note.indexed = false;
    note.tags = tagsList;

    return res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    await db.query('ROLLBACK;').catch(() => {});
    next(error);
  }
}

export async function updateNote(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  const db = await getDatabase();
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { collectionId, title, content, tags, fileName, fileType, fileData, filePreview } = req.body;

    await db.query('BEGIN;');

    const existing = await db.query(
      `SELECT id, collection_id as "collectionId" FROM "notes" WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      await db.query('ROLLBACK;');
      return res.status(404).json({
        success: false,
        error: { message: 'Note not found or access denied' },
      });
    }

    const currentCollectionId = (existing.rows[0] as any).collectionId;
    const nextCollectionId =
      collectionId !== undefined ? (collectionId ? collectionId : null) : currentCollectionId;

    const result = await db.query(
      `UPDATE "notes"
       SET collection_id = $1,
           title = COALESCE($2, title),
           content = COALESCE($3, content),
           file_name = COALESCE($4, file_name),
           file_type = COALESCE($5, file_type),
           file_data = COALESCE($6, file_data),
           file_preview = COALESCE($7, file_preview),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9 AND deleted_at IS NULL
       RETURNING id, user_id as "userId", collection_id as "collectionId", title, content,
                 file_name as "fileName", file_type as "fileType", file_data as "fileData", file_preview as "filePreview",
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [nextCollectionId, title || null, content || null, fileName || null, fileType || null, fileData || null, filePreview || null, id, userId]
    );

    const note = result.rows[0] as any;

    if (tags !== undefined) {
      const cleanTags = normalizeTags(tags);
      await db.query(`DELETE FROM "note_tags" WHERE note_id = $1;`, [id]);
      for (const cleanTag of cleanTags) {
        const tagRes = await db.query(
          `INSERT INTO "tags" (user_id, name) VALUES ($1, $2)
           ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id;`,
          [userId, cleanTag]
        );
        const tagId = (tagRes.rows[0] as any).id;

        await db.query(
          `INSERT INTO "note_tags" (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [id, tagId]
        );
      }
      note.tags = cleanTags;
    } else {
      const existingTagsRes = await db.query(
        `SELECT t.name FROM "note_tags" nt JOIN "tags" t ON t.id = nt.tag_id WHERE nt.note_id = $1 ORDER BY t.name ASC;`,
        [id]
      );
      note.tags = existingTagsRes.rows.map((r: any) => r.name);
    }

    if (note.collectionId) {
      const colRes = await db.query(`SELECT name FROM "collections" WHERE id = $1;`, [note.collectionId]);
      if (colRes.rows.length > 0) {
        note.collectionName = (colRes.rows[0] as any).name;
      }
    }

    await db.query('COMMIT;');

    // Editing content, title or tags invalidates the stored AI snapshot:
    // embeddings are derived from exactly those fields. Drop them so the
    // assistant only ever sees what the user explicitly (re-)indexed.
    const affectsEmbedding = content !== undefined || title !== undefined || tags !== undefined;
    if (affectsEmbedding) {
      await db.query(`DELETE FROM "note_embeddings" WHERE note_id = $1;`, [id]);
      // Embeddings were just dropped: the note is unindexed until re-indexed.
      note.indexed = false;
    } else {
      const indexedIds = await getIndexedNoteIds(db, [note]);
      note.indexed = indexedIds.has(note.id);
    }

    return res.status(200).json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    await db.query('ROLLBACK;').catch(() => {});
    next(error);
  }
}

export async function deleteNote(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  const db = await getDatabase();
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await db.query(
      `UPDATE "notes" SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id;`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Note not found or access denied' },
      });
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Note moved to trash successfully' },
    });
  } catch (error: any) {
    next(error);
  }
}

export async function restoreNote(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const result = await (await getDatabase()).query(
      `UPDATE "notes" SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id;`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Trashed note not found or access denied' },
      });
    }
    return res.status(200).json({ success: true, data: { message: 'Note restored successfully' } });
  } catch (error: any) {
    next(error);
  }
}

export async function permanentlyDeleteNote(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const result = await (await getDatabase()).query(
      `DELETE FROM "notes" WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id;`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Trashed note not found or access denied' },
      });
    }
    return res.status(200).json({ success: true, data: { message: 'Note permanently deleted' } });
  } catch (error: any) {
    next(error);
  }
}

/**
 * Explicit AI indexing: the user picks which notes the assistant may search.
 * Only these notes get embeddings, so free-tier API usage stays fully under
 * the user's control and /rag/ask never touches unindexed notes.
 */
export async function indexNotes(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { noteIds, force = false } = req.body as { noteIds: string[]; force?: boolean };
    const db = await getDatabase();

    const provider = getEmbeddingProvider();
    if (!provider) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'AI indexing is not configured. Add GEMINI_API_KEY to .env and restart the server.',
        },
      });
    }

    const owned = await db.query(
      `SELECT n.id, n.title, n.content, n.deleted_at,
              n.file_name as "fileName", n.file_type as "fileType",
              COALESCE(string_agg(DISTINCT t.name, ','), '') as "tagNames"
       FROM "notes" n
       LEFT JOIN "note_tags" nt ON nt.note_id = n.id
       LEFT JOIN "tags" t ON t.id = nt.tag_id
       WHERE n.id = ANY($1::uuid[]) AND n.user_id = $2
       GROUP BY n.id, n.title, n.content, n.deleted_at, n.file_name, n.file_type;`,
      [noteIds, userId]
    );

    const found = new Map<string, any>(
      (owned.rows as any[]).map((row) => [row.id, row])
    );

    const results: Array<{
      noteId: string;
      title: string | null;
      status: 'indexed' | 'up_to_date' | 'failed' | 'not_found' | 'trashed';
      chunks?: number;
      error?: string;
    }> = [];
    const summary = { requested: noteIds.length, indexed: 0, upToDate: 0, failed: 0 };

    for (const noteId of noteIds) {
      const note = found.get(noteId);
      if (!note) {
        results.push({ noteId, title: null, status: 'not_found' });
        summary.failed++;
        continue;
      }
      if (note.deleted_at) {
        results.push({ noteId, title: note.title, status: 'trashed' });
        summary.failed++;
        continue;
      }

      // Self-heal: notes uploaded before scanned-PDF OCR existed have only a
      // placeholder as their content. Re-run extraction (now OCR-capable)
      // against the stored original file so the real text gets indexed.
      if (isPlaceholderContent(note.content)) {
        const fileRes = await db.query(
          `SELECT file_data as "fileData" FROM "notes" WHERE id = $1 AND user_id = $2;`,
          [noteId, userId]
        );
        const buffer = dataUrlToBuffer((fileRes.rows[0] as any)?.fileData || '');
        if (buffer) {
          const realText = await extractTextFromFile({
            buffer,
            originalname: note.fileName || 'uploaded-file',
            mimetype: note.fileType || '',
          } as Express.Multer.File).catch(() => '');
          const looksReal =
            !!realText &&
            !realText.startsWith('[Uploaded ') &&
            !realText.startsWith('(No extractable text content found');
          if (looksReal) {
            note.content = realText;
            await db.query(`UPDATE "notes" SET content = $1 WHERE id = $2 AND user_id = $3;`, [
              realText,
              noteId,
              userId,
            ]);
          }
        }
      }

      // A note that is still just a placeholder has no real text to embed.
      // Indexing it would only pollute retrieval with junk chunks (like the
      // screenshot showing "[Uploaded Scanned PDF Document: ...]" as a
      // match), so drop any stale embeddings and report the skip.
      if (isPlaceholderContent(note.content)) {
        await db.query(`DELETE FROM "note_embeddings" WHERE note_id = $1;`, [noteId]);
        results.push({
          noteId,
          title: note.title,
          status: 'failed',
          error: 'No extractable text in this note (the scanned file could not be OCR\'d)',
        });
        summary.failed++;
        continue;
      }

      // Cheap, local-only check: if the stored chunk hashes still match the
      // note content, no API call is needed at all.
      if (!force) {
        const expectedHashes = chunkText(note.content || '').map((c) => hashContent(c.content));
        if (expectedHashes.length > 0 && await noteEmbeddingsAreCurrent(db, noteId, provider.model, expectedHashes)) {
          results.push({ noteId, title: note.title, status: 'up_to_date' });
          summary.upToDate++;
          continue;
        }
      }

      const sync = await replaceNoteEmbeddings(db, noteId, {
        title: note.title,
        content: note.content,
        tags: note.tagNames ? note.tagNames.split(',').filter(Boolean) : [],
      });
      if (sync.error) {
        results.push({ noteId, title: note.title, status: 'failed', error: sync.error });
        summary.failed++;
      } else {
        results.push({ noteId, title: note.title, status: 'indexed', chunks: sync.chunks });
        summary.indexed++;
      }
    }

    return res.status(200).json({
      success: true,
      data: { results, summary },
    });
  } catch (error: any) {
    next(error);
  }
}
