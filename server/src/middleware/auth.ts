import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    next(createError('Authentication required', 401, 'UNAUTHORIZED'));
    return;
  }

  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  // Just passes through - routes can check session themselves
  next();
}
