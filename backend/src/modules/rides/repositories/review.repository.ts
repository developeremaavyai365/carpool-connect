import { queryOne, query } from './pg.client';

export interface CreateReviewDto {
  trip_id: number;
  booking_id?: number;
  reviewee_id: number;
  rating: number;
  comment?: string;
  role: 'passenger' | 'driver';
}

export class ReviewRepository {
  async create(reviewerId: number, dto: CreateReviewDto) {
    const row = await queryOne(
      `INSERT INTO trip_reviews (
        trip_id, booking_id, reviewer_id, reviewee_id, rating, comment, role
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        dto.trip_id,
        dto.booking_id ?? null,
        reviewerId,
        dto.reviewee_id,
        dto.rating,
        dto.comment || '',
        dto.role,
      ],
    );

    await query(
      `INSERT INTO driver_profiles (user_id, rating_avg, rating_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id) DO UPDATE SET
         rating_avg = (
           (driver_profiles.rating_avg * driver_profiles.rating_count + EXCLUDED.rating_avg)
           / (driver_profiles.rating_count + 1)
         ),
         rating_count = driver_profiles.rating_count + 1,
         updated_at = now()`,
      [dto.reviewee_id, dto.rating],
    );

    return row;
  }

  async listForUser(userId: number) {
    return query(
      `SELECT r.*, u.name AS reviewer_name
       FROM trip_reviews r
       JOIN users u ON u.id = r.reviewer_id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC LIMIT 50`,
      [userId],
    );
  }
}

export const reviewRepository = new ReviewRepository();
