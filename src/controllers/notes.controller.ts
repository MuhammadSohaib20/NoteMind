import { Response, NextFunction } from 'express';
import { z } from 'zod';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { getDatabase } from '../db';
import { AuthenticatedRequest, ApiResponse } from '../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

async function performOcrOnBuffer(buffer: Buffer): Promise<string> {
  try {
    const worker = await createWorker('eng');
    const ret = await worker.recognize(buffer);
    await worker.terminate();
    return ret.data && ret.data.text ? ret.data.text.trim() : '';
  } catch (err) {
    console.error('OCR Extraction Error:', err);
    return '';
  }
}

async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
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

    if (cleanText.length > 0) {
      extractedText = cleanText;
    } else {
      extractedText = `[Uploaded Scanned PDF Document: "${file.originalname}"]`;
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

  return extractedText;
}

function generateMockVector(dim: number = 768, text: string = ''): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  const vec = Array.from({ length: dim }, (_, i) => Math.sin(i + hash) * 0.1);
  return `[${vec.join(',')}]`;
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
  }),
});

export async function listNotes(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { collectionId, tag, search, cursor, limit = '50' } = req.query as {
      collectionId?: string;
      tag?: string;
      search?: string;
      cursor?: string;
      limit?: string;
    };

    const pageSize = parseInt(limit, 10) || 50;
    const db = await getDatabase();

    let query = `
      SELECT n.id, n.user_id as "userId", n.collection_id as "collectionId",
             n.title, n.content, n.file_name as "fileName", n.file_type as "fileType", n.file_data as "fileData",
             n.created_at as "createdAt", n.updated_at as "updatedAt",
             c.name as "collectionName",
             COALESCE(string_agg(DISTINCT t.name, ','), '') as "tagNames"
      FROM "notes" n
      LEFT JOIN "collections" c ON c.id = n.collection_id
      LEFT JOIN "note_tags" nt ON nt.note_id = n.id
      LEFT JOIN "tags" t ON t.id = nt.tag_id
      WHERE n.user_id = $1
    `;

    const params: any[] = [userId];

    if (collectionId) {
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
              n.created_at as "createdAt", n.updated_at as "updatedAt",
              c.name as "collectionName",
              COALESCE(string_agg(DISTINCT t.name, ','), '') as "tagNames"
       FROM "notes" n
       LEFT JOIN "collections" c ON c.id = n.collection_id
       LEFT JOIN "note_tags" nt ON nt.note_id = n.id
       LEFT JOIN "tags" t ON t.id = nt.tag_id
       WHERE n.id = $1 AND n.user_id = $2
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

    return res.status(200).json({
      success: true,
      data: note,
    });
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
    const { collectionId, title, content, tags = [], fileName, fileType, fileData } = req.body;
    const cleanTags = normalizeTags(tags);

    await db.query('BEGIN;');

    const result = await db.query(
      `INSERT INTO "notes" (user_id, collection_id, title, content, file_name, file_type, file_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id as "userId", collection_id as "collectionId", title, content,
                 file_name as "fileName", file_type as "fileType", file_data as "fileData",
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [userId, collectionId || null, title, content, fileName || null, fileType || null, fileData || null]
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

    const vectorStr = generateMockVector(768, `${title} ${cleanTags.join(' ')} ${content}`);
    await db.query(
      `INSERT INTO "note_embeddings" (note_id, chunk_content, embedding)
       VALUES ($1, $2, $3::vector);`,
      [note.id, content, vectorStr]
    );

    if (collectionId) {
      const colRes = await db.query(`SELECT name FROM "collections" WHERE id = $1;`, [collectionId]);
      if (colRes.rows.length > 0) {
        note.collectionName = (colRes.rows[0] as any).name;
      }
    }

    await db.query('COMMIT;');

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

    if (fileExt && !tagsList.some((t) => t.toLowerCase() === fileExt.toLowerCase())) {
      tagsList.push(fileExt);
    }

    const fileMime = file.mimetype || 'application/octet-stream';
    let fileDataUrl: string | null = null;
    if (file.buffer && file.buffer.length <= 15 * 1024 * 1024) {
      try {
        fileDataUrl = `data:${fileMime};base64,${file.buffer.toString('base64')}`;
      } catch {
        fileDataUrl = null;
      }
    }

    await db.query('BEGIN;');

    const result = await db.query(
      `INSERT INTO "notes" (user_id, collection_id, title, content, file_name, file_type, file_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id as "userId", collection_id as "collectionId", title, content,
                 file_name as "fileName", file_type as "fileType", file_data as "fileData",
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [userId, collectionId || null, noteTitle, extractedText, file.originalname, fileMime, fileDataUrl]
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

    const vectorStr = generateMockVector(768, `${noteTitle} ${tagsList.join(' ')} ${extractedText}`);
    await db.query(
      `INSERT INTO "note_embeddings" (note_id, chunk_content, embedding)
       VALUES ($1, $2, $3::vector);`,
      [note.id, extractedText, vectorStr]
    );

    if (collectionId) {
      const colRes = await db.query(`SELECT name FROM "collections" WHERE id = $1;`, [collectionId]);
      if (colRes.rows.length > 0) {
        note.collectionName = (colRes.rows[0] as any).name;
      }
    }

    await db.query('COMMIT;');

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
    const { collectionId, title, content, tags, fileName, fileType, fileData } = req.body;

    await db.query('BEGIN;');

    const existing = await db.query(
      `SELECT id, collection_id as "collectionId" FROM "notes" WHERE id = $1 AND user_id = $2;`,
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8
       RETURNING id, user_id as "userId", collection_id as "collectionId", title, content,
                 file_name as "fileName", file_type as "fileType", file_data as "fileData",
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [nextCollectionId, title || null, content || null, fileName || null, fileType || null, fileData || null, id, userId]
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

    if (content || title || tags !== undefined) {
      const vectorStr = generateMockVector(
        768,
        `${note.title} ${(note.tags || []).join(' ')} ${note.content}`
      );
      await db.query(`DELETE FROM "note_embeddings" WHERE note_id = $1;`, [id]);
      await db.query(
        `INSERT INTO "note_embeddings" (note_id, chunk_content, embedding)
         VALUES ($1, $2, $3::vector);`,
        [id, note.content, vectorStr]
      );
    }

    if (note.collectionId) {
      const colRes = await db.query(`SELECT name FROM "collections" WHERE id = $1;`, [note.collectionId]);
      if (colRes.rows.length > 0) {
        note.collectionName = (colRes.rows[0] as any).name;
      }
    }

    await db.query('COMMIT;');

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

    await db.query('BEGIN;');

    const result = await db.query(`DELETE FROM "notes" WHERE id = $1 AND user_id = $2 RETURNING id;`, [id, userId]);

    if (result.rows.length === 0) {
      await db.query('ROLLBACK;');
      return res.status(404).json({
        success: false,
        error: { message: 'Note not found or access denied' },
      });
    }

    await db.query('COMMIT;');

    return res.status(200).json({
      success: true,
      data: { message: 'Note deleted successfully' },
    });
  } catch (error: any) {
    await db.query('ROLLBACK;').catch(() => {});
    next(error);
  }
}
