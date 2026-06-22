import type { Request, Response, NextFunction } from 'express';
import type { AuthUser } from '../types/dto';

export function ridesErrorHandler(
  err: Error & { status?: number; issues?: unknown },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(err.issues ? { issues: err.issues } : {}),
  });
}

export type AuthedRequest = Request & { user?: AuthUser };
