import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db';
import { AuthenticatedRequest, ApiResponse } from '../types';

export const createTagSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Tag name is required').max(100),
  }),
});

export const updateTagSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Tag name is required').max(100),
  }),
});

export async function listTags(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const db = await getDatabase();

    const result = await db.query(
      `SELECT t.id, t.user_id as "userId", t.name, t.created_at as "createdAt",
              COUNT(nt.note_id) as "noteCount"
       FROM "tags" t
       LEFT JOIN "note_tags" nt ON nt.tag_id = t.id
       WHERE t.user_id = $1
       GROUP BY t.id, t.user_id, t.name, t.created_at
       ORDER BY t.name ASC;`,
      [userId]
    );

    const formatted = result.rows.map((row: any) => ({
      ...row,
      noteCount: parseInt(row.noteCount || '0', 10),
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function createTag(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const rawName = req.body.name || '';
    const name = rawName.trim().replace(/^#+/, '').trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        error: { message: 'Tag name is required' },
      });
    }
    const db = await getDatabase();

    const existing = await db.query(
      `SELECT t.id, t.user_id as "userId", t.name, t.created_at as "createdAt", t.updated_at as "updatedAt",
              COUNT(nt.note_id) as "noteCount"
       FROM "tags" t
       LEFT JOIN "note_tags" nt ON nt.tag_id = t.id
       WHERE t.user_id = $1 AND LOWER(t.name) = LOWER($2)
       GROUP BY t.id, t.user_id, t.name, t.created_at, t.updated_at;`,
      [userId, name]
    );

    if (existing.rows.length > 0) {
      const existingTag = existing.rows[0] as any;
      existingTag.noteCount = parseInt(existingTag.noteCount || '0', 10);
      return res.status(200).json({
        success: true,
        data: existingTag,
      });
    }

    const result = await db.query(
      `INSERT INTO "tags" (user_id, name)
       VALUES ($1, $2)
       RETURNING id, user_id as "userId", name, created_at as "createdAt", updated_at as "updatedAt";`,
      [userId, name]
    );

    const tag = result.rows[0] as any;
    tag.noteCount = 0;

    return res.status(201).json({
      success: true,
      data: tag,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function updateTag(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const rawName = req.body.name || '';
    const name = rawName.trim().replace(/^#+/, '').trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        error: { message: 'Tag name is required' },
      });
    }
    const db = await getDatabase();

    const result = await db.query(
      `UPDATE "tags"
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id as "userId", name, created_at as "createdAt", updated_at as "updatedAt";`,
      [name, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Tag not found or access denied' },
      });
    }

    const countRes = await db.query(`SELECT COUNT(*) as "noteCount" FROM "note_tags" WHERE tag_id = $1;`, [id]);
    const tag = result.rows[0] as any;
    tag.noteCount = parseInt((countRes.rows[0] as any).noteCount || '0', 10);

    return res.status(200).json({
      success: true,
      data: tag,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function deleteTag(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const db = await getDatabase();

    const result = await db.query(
      `DELETE FROM "tags" WHERE id = $1 AND user_id = $2 RETURNING id;`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Tag not found or access denied' },
      });
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Tag deleted successfully' },
    });
  } catch (error: any) {
    next(error);
  }
}
