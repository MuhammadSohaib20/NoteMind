import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db';
import { AuthenticatedRequest, ApiResponse } from '../types';

export const createCollectionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Collection name is required').max(255),
  }),
});

export const updateCollectionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Collection name is required').max(255),
  }),
});

export async function listCollections(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const db = await getDatabase();

    const result = await db.query(
      `SELECT c.id, c.user_id as "userId", c.name, c.created_at as "createdAt", c.updated_at as "updatedAt",
              COUNT(n.id) as "noteCount"
       FROM "collections" c
       LEFT JOIN "notes" n ON n.collection_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id, c.user_id, c.name, c.created_at, c.updated_at
       ORDER BY c.created_at DESC;`,
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

export async function getCollectionById(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const db = await getDatabase();

    const result = await db.query(
      `SELECT c.id, c.user_id as "userId", c.name, c.created_at as "createdAt", c.updated_at as "updatedAt",
              COUNT(n.id) as "noteCount"
       FROM "collections" c
       LEFT JOIN "notes" n ON n.collection_id = c.id
       WHERE c.id = $1 AND c.user_id = $2
       GROUP BY c.id, c.user_id, c.name, c.created_at, c.updated_at;`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Collection not found or access denied' },
      });
    }

    const row: any = result.rows[0];
    row.noteCount = parseInt(row.noteCount || '0', 10);

    return res.status(200).json({
      success: true,
      data: row,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function createCollection(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { name } = req.body;
    const db = await getDatabase();

    const result = await db.query(
      `INSERT INTO "collections" (user_id, name)
       VALUES ($1, $2)
       RETURNING id, user_id as "userId", name, created_at as "createdAt", updated_at as "updatedAt";`,
      [userId, name]
    );

    const collection = result.rows[0] as any;
    collection.noteCount = 0;

    return res.status(201).json({
      success: true,
      data: collection,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function updateCollection(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name } = req.body;
    const db = await getDatabase();

    const result = await db.query(
      `UPDATE "collections"
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id as "userId", name, created_at as "createdAt", updated_at as "updatedAt";`,
      [name, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Collection not found or access denied' },
      });
    }

    const countRes = await db.query(`SELECT COUNT(*) as "noteCount" FROM "notes" WHERE collection_id = $1;`, [id]);
    const collection = result.rows[0] as any;
    collection.noteCount = parseInt((countRes.rows[0] as any).noteCount || '0', 10);

    return res.status(200).json({
      success: true,
      data: collection,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function deleteCollection(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const db = await getDatabase();

    await db.query('BEGIN;');
    const result = await db.query(
      `DELETE FROM "collections" WHERE id = $1 AND user_id = $2 RETURNING id;`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      await db.query('ROLLBACK;');
      return res.status(404).json({
        success: false,
        error: { message: 'Collection not found or access denied' },
      });
    }

    await db.query('COMMIT;');

    return res.status(200).json({
      success: true,
      data: { message: 'Collection deleted successfully' },
    });
  } catch (error: any) {
    const db = await getDatabase();
    await db.query('ROLLBACK;').catch(() => {});
    next(error);
  }
}
