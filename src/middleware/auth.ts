import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, ApiResponse } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'notemind_super_secret_jwt_key_2026';

export function authenticate(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Unauthorized access: Missing or invalid token format',
      },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Unauthorized access: Expired or invalid token',
      },
    });
  }
}

export function generateToken(payload: { id: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
