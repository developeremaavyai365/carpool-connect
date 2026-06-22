import { z } from 'zod';

export const searchRidesSchema = z.object({
  pickup_lat: z.coerce.number().min(-90).max(90),
  pickup_lng: z.coerce.number().min(-180).max(180),
  drop_lat: z.coerce.number().min(-90).max(90),
  drop_lng: z.coerce.number().min(-180).max(180),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  seats: z.coerce.number().int().min(1).max(8).optional(),
});

export const publishTripSchema = z.object({
  source_label: z.string().min(2).max(500),
  dest_label: z.string().min(2).max(500),
  source_lat: z.number().min(-90).max(90),
  source_lng: z.number().min(-180).max(180),
  dest_lat: z.number().min(-90).max(90),
  dest_lng: z.number().min(-180).max(180),
  departure_at: z.string().datetime({ offset: true }),
  seats_available: z.number().int().min(1).max(8),
  price_per_seat: z.number().min(0),
  city: z.string().max(100).optional(),
});

export const bookTripSchema = z.object({
  trip_id: z.number().int().positive(),
  seats: z.number().int().min(1).max(8).optional(),
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  drop_lat: z.number().min(-90).max(90),
  drop_lng: z.number().min(-180).max(180),
  pickup_label: z.string().max(500).optional(),
  drop_label: z.string().max(500).optional(),
});

export const createReviewSchema = z.object({
  trip_id: z.number().int().positive(),
  booking_id: z.number().int().positive().optional(),
  reviewee_id: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  role: z.enum(['passenger', 'driver']),
});

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join('; ');
    throw Object.assign(new Error(message), { status: 400, issues: result.error.issues });
  }
  return result.data;
}
