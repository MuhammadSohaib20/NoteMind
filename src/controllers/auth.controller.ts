import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDatabase } from '../db';
import { generateToken } from '../middleware/auth';
import { ApiResponse, AuthenticatedRequest } from '../types';

export const signupSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string(),
  }),
});

export const updatePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string({ required_error: 'Current password is required' }),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  }),
});

export async function signup(req: Request, res: Response<ApiResponse>, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const db = await getDatabase();

    // Check if user exists
    const existing = await db.query(`SELECT id FROM "users" WHERE email = $1;`, [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'User with this email already exists' },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO "users" (email, password_hash) VALUES ($1, $2) RETURNING id, email;`,
      [email, passwordHash]
    );

    const user = result.rows[0] as { id: string; email: string };
    const token = generateToken({ id: user.id, email: user.email });

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response<ApiResponse>, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const db = await getDatabase();

    const result = await db.query(`SELECT id, email, password_hash FROM "users" WHERE email = $1;`, [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid credentials' },
      });
    }

    const user = result.rows[0] as { id: string; email: string; password_hash: string };
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid credentials' },
      });
    }

    const token = generateToken({ id: user.id, email: user.email });

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePassword(req: Request, res: Response<ApiResponse>, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized access' },
      });
    }

    const { currentPassword, newPassword } = req.body;
    const db = await getDatabase();

    const result = await db.query(`SELECT id, password_hash FROM "users" WHERE id = $1;`, [authReq.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      });
    }

    const user = result.rows[0] as { id: string; password_hash: string };
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: { message: 'Current password is incorrect' },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await db.query(`UPDATE "users" SET password_hash = $1, updated_at = NOW() WHERE id = $2;`, [
      newPasswordHash,
      authReq.user.id,
    ]);

    return res.status(200).json({
      success: true,
      data: { message: 'Password updated successfully' },
    });
  } catch (error) {
    next(error);
  }
}

