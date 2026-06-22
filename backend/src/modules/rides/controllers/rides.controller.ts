import type { Request, Response } from 'express';
import type { AuthedRequest } from '../middlewares/error.middleware';
import { matchingService } from '../services/matching.service';
import { tripService, bookingService } from '../services/trip.service';
import { reviewService } from '../services/review.service';
import { MATCHING_RADIUS_KM } from '../config/constants';
import {
  validate,
  searchRidesSchema,
  publishTripSchema,
  bookTripSchema,
  createReviewSchema,
} from '../validators/rides.validators';

export class RidesController {
  matchingConfig = async (_req: Request, res: Response): Promise<void> => {
    res.json({
      matching_radius_km: MATCHING_RADIUS_KM,
      match_types: ['exact', 'nearby', 'recommended'],
    });
  };

  search = async (req: AuthedRequest, res: Response): Promise<void> => {
    const params = validate(searchRidesSchema, req.query);
    const rides = await matchingService.search(params, { excludeDriverId: req.user?.id });
    res.json({ rides, count: rides.length });
  };

  publish = async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const dto = validate(publishTripSchema, req.body);
    const trip = await tripService.publish(req.user.id, dto);
    res.status(201).json({ trip });
  };

  getById = async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid trip id' });
      return;
    }
    const trip = await tripService.getById(id);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json({ trip });
  };

  cancel = async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const id = Number(req.params.id);
    const trip = await tripService.cancel(id, req.user.id);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found or not yours' });
      return;
    }
    res.json({ trip });
  };

  book = async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const dto = validate(bookTripSchema, req.body);
    try {
      const result = await bookingService.book(req.user.id, dto);
      res.status(201).json(result);
    } catch (err) {
      const message = (err as Error).message;
      const status = (err as { status?: number }).status;
      if (status === 403 || message.includes('Cannot book your own')) {
        res.status(403).json({ error: 'You cannot book your own commute.' });
        return;
      }
      if (message.includes('Not enough seats') || message.includes('not available')) {
        res.status(409).json({ error: message });
        return;
      }
      throw err;
    }
  };

  myBookings = async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const bookings = await bookingService.listForPassenger(req.user.id);
    res.json({ bookings });
  };

  driverBookings = async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const bookings = await bookingService.listForDriver(req.user.id);
    res.json({ bookings });
  };

  cancelBooking = async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const id = Number(req.params.bookingId);
    const result = await bookingService.cancelBooking(id, req.user.id);
    res.json(result);
  };

  createReview = async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const dto = validate(createReviewSchema, req.body);
    const review = await reviewService.create(req.user.id, dto);
    res.status(201).json({ review });
  };

  myReviews = async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const reviews = await reviewService.listForUser(req.user.id);
    res.json({ reviews });
  };
}

export const ridesController = new RidesController();
