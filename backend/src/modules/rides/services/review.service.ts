import { reviewRepository } from '../repositories/review.repository';
import type { CreateReviewDto } from '../repositories/review.repository';

export class ReviewService {
  async create(reviewerId: number, dto: CreateReviewDto) {
    return reviewRepository.create(reviewerId, dto);
  }

  async listForUser(userId: number) {
    return reviewRepository.listForUser(userId);
  }
}

export const reviewService = new ReviewService();
