import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDatabase, withTransaction } from '../db';
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
      `SELECT c.id, c.user_id as "userId", c.name, c.color_index as "colorIndex",
              c.created_at as "createdAt", c.updated_at as "updatedAt",
              COUNT(n.id) as "noteCount"
       FROM "collections" c
       LEFT JOIN "notes" n ON n.collection_id = c.id AND n.deleted_at IS NULL
       WHERE c.user_id = $1
       GROUP BY c.id, c.user_id, c.name, c.color_index, c.created_at, c.updated_at
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
      `SELECT c.id, c.user_id as "userId", c.name, c.color_index as "colorIndex",
              c.created_at as "createdAt", c.updated_at as "updatedAt",
              COUNT(n.id) as "noteCount"
       FROM "collections" c
       LEFT JOIN "notes" n ON n.collection_id = c.id AND n.deleted_at IS NULL
       WHERE c.id = $1 AND c.user_id = $2
       GROUP BY c.id, c.user_id, c.name, c.color_index, c.created_at, c.updated_at;`,
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

    const usedColors = await db.query(
      `SELECT color_index as "colorIndex" FROM "collections" WHERE user_id = $1;`,
      [userId]
    );
    const usedColorIndexes = new Set(
      usedColors.rows.map((row: any) => Number(row.colorIndex))
    );
    let colorIndex = 0;
    while (usedColorIndexes.has(colorIndex)) {
      colorIndex += 1;
    }

    const result = await db.query(
      `INSERT INTO "collections" (user_id, name, color_index)
       VALUES ($1, $2, $3)
       RETURNING id, user_id as "userId", name, color_index as "colorIndex",
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [userId, name, colorIndex]
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
       RETURNING id, user_id as "userId", name, color_index as "colorIndex",
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [name, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Collection not found or access denied' },
      });
    }

    const countRes = await db.query(`SELECT COUNT(*) as "noteCount" FROM "notes" WHERE collection_id = $1 AND deleted_at IS NULL;`, [id]);
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

    // Both statements must land on the same connection: the UPDATE moves the
    // collection's notes to Trash, and the DELETE only succeeds if the
    // collection belongs to this user. withTransaction pins one pooled client.
    // The ownership check locks the row so a concurrent delete cannot slip in
    // between the UPDATE and the DELETE.
    const deleted = await withTransaction(async (client) => {
      const owned = await client.query(
        `SELECT 1 FROM "collections" WHERE id = $1 AND user_id = $2 FOR UPDATE;`,
        [id, userId]
      );

      if (owned.rows.length === 0) {
        return false;
      }

      await client.query(
        `UPDATE "notes"
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE collection_id = $1 AND user_id = $2 AND deleted_at IS NULL;`,
        [id, userId]
      );

      await client.query(`DELETE FROM "collections" WHERE id = $1 AND user_id = $2;`, [
        id,
        userId,
      ]);
      return true;
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { message: 'Collection not found or access denied' },
      });
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Collection deleted successfully' },
    });
  } catch (error: any) {
    next(error);
  }
}
