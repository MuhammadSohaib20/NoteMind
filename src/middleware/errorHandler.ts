import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiResponse } from '../types';

export function errorHandler(
  err: any,
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  console.error('❌ API Error:', err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        details: err.errors,
      },
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    success: false,
    error: {
      message,
    },
  });
}
