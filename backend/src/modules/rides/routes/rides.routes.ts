import { Router, type Request, type Response, type NextFunction } from 'express';
import { ridesController } from '../controllers/rides.controller';
import { ridesErrorHandler, type AuthedRequest } from '../middlewares/error.middleware';

// Shared with main API — resolves from compiled dist or TS source
const path = require('path') as typeof import('path');
const { resolveUserFromToken } = require(path.resolve(__dirname, '../../../../src/middleware/auth')) as {
  resolveUserFromToken: (token: string) => Promise<{ id: number; email?: string; role?: string } | null>;
};

function authenticate(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  resolveUserFromToken(token)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      req.user = { id: user.id, email: user.email };
      next();
    })
    .catch(() => {
      res.status(401).json({ error: 'Invalid or expired token' });
    });
}

function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    next();
    return;
  }
  resolveUserFromToken(token)
    .then((user) => {
      if (user) req.user = { id: user.id, email: user.email };
      next();
    })
    .catch(() => next());
}

export function createRidesRouter(): Router {
  const router = Router();

  router.get('/matching-config', wrapPublic(ridesController.matchingConfig));
  router.get('/search', optionalAuth, wrap(ridesController.search));

  router.use(authenticate);

  router.get('/bookings/mine', wrap(ridesController.myBookings));
  router.get('/bookings/driver', wrap(ridesController.driverBookings));
  router.delete('/bookings/:bookingId', wrap(ridesController.cancelBooking));
  router.post('/book', wrap(ridesController.book));
  router.post('/reviews', wrap(ridesController.createReview));
  router.get('/reviews/mine', wrap(ridesController.myReviews));
  router.post('/', wrap(ridesController.publish));
  router.get('/:id', wrap(ridesController.getById));
  router.delete('/:id', wrap(ridesController.cancel));

  router.use(ridesErrorHandler);

  return router;
}

function wrap(fn: (req: AuthedRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as AuthedRequest, res).catch(next);
  };
}

function wrapPublic(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export default createRidesRouter;
