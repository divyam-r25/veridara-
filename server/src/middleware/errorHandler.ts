import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  // Never expose internal details in production
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'An unexpected error occurred'
    : err.message;

  logger.error(`Error [${code}]: ${err.message}`);

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message
    }
  });
}

export function createError(message: string, statusCode: number, code: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
