import type { RankedTrip, SearchRidesDto, TripRow } from '../types/dto';
import { MATCHING_RADIUS_KM, RANKING_WEIGHTS } from '../config/constants';
import { haversineM } from '../utils/geospatial';
import { classifyMatchType } from '../utils/coverage';

interface ScoredTrip extends TripRow {
  pickup_position?: number;
  drop_position?: number;
  pickup_proximity_km?: number;
  dest_proximity_km?: number;
  match_type?: RankedTrip['match_type'];
}

export class RankingService {
  rankTrips(trips: ScoredTrip[], params: SearchRidesDto): RankedTrip[] {
    const pickup = { lat: params.pickup_lat, lng: params.pickup_lng };
    const drop = { lat: params.drop_lat, lng: params.drop_lng };
    const directDist = haversineM(pickup, drop);

    const scored: RankedTrip[] = trips.map((trip) => {
      const pickupPos = Number(trip.pickup_position ?? 0);
      const dropPos = Number(trip.drop_position ?? 1);
      const overlap = Math.max(0, dropPos - pickupPos);

      const routeOverlapScore = overlap * 100;

      const pickupKm = trip.pickup_proximity_km
        ?? haversineM(pickup, { lat: trip.source_lat, lng: trip.source_lng }) / 1000;
      const destKm = trip.dest_proximity_km
        ?? haversineM(drop, { lat: trip.dest_lat, lng: trip.dest_lng }) / 1000;

      const pickupProximityScore = Math.max(0, 100 - pickupKm * 2);
      const destProximityScore = Math.max(0, 100 - destKm * 2);

      const tripTime = new Date(trip.departure_at).getTime();
      let timeSimilarityScore = Math.max(0, 100 - Math.abs((tripTime - Date.now()) / 3600000 - 24) * 2);
      if (params.date) {
        const searchDay = new Date(`${params.date}T12:00:00`).getTime();
        const tripDay = new Date(trip.departure_at).setHours(12, 0, 0, 0);
        const dayDiff = Math.abs(tripDay - searchDay) / 86400000;
        timeSimilarityScore = Math.max(0, 100 - dayDiff * 40);
      }

      const sourceDist = haversineM(pickup, { lat: trip.source_lat, lng: trip.source_lng });
      const destDist = haversineM(drop, { lat: trip.dest_lat, lng: trip.dest_lng });
      const deviation = (sourceDist + destDist) / 1000;
      const distanceDeviationScore = Math.max(0, 100 - deviation * 2);

      const driverRatingScore = (trip.driver_rating ?? 5) * 20;
      const cancellationPenalty = Math.min(50, (trip.cancellation_count ?? 0) * 10);
      const priceScore = Math.max(0, 100 - trip.price_per_seat * 2);
      const seatBonus = Math.min(10, (trip.seats_available ?? 1) * 2);

      const match_score = (
        routeOverlapScore * RANKING_WEIGHTS.routeOverlap
        + pickupProximityScore * RANKING_WEIGHTS.pickupProximity
        + destProximityScore * RANKING_WEIGHTS.destProximity
        + timeSimilarityScore * RANKING_WEIGHTS.timeSimilarity
        + distanceDeviationScore * RANKING_WEIGHTS.distanceDeviation
        + driverRatingScore * RANKING_WEIGHTS.driverRating
        - cancellationPenalty * RANKING_WEIGHTS.cancellationPenalty
        + priceScore * RANKING_WEIGHTS.price
        + seatBonus
      );

      const detour_km = Math.max(0, (deviation - directDist / 1000) / 2);
      const match_type = trip.match_type ?? classifyMatchType(pickupKm, destKm);

      return {
        ...trip,
        match_score: Math.round(match_score * 100) / 100,
        match_type,
        pickup_position: pickupPos,
        drop_position: dropPos,
        pickup_proximity_km: Math.round(pickupKm * 10) / 10,
        dest_proximity_km: Math.round(destKm * 10) / 10,
        detour_km: Math.round(detour_km * 10) / 10,
        matching_radius_km: MATCHING_RADIUS_KM,
      };
    });

    const typeOrder = { exact: 0, nearby: 1, recommended: 2 };
    return scored.sort((a, b) => {
      const typeDiff = typeOrder[a.match_type] - typeOrder[b.match_type];
      if (typeDiff !== 0) return typeDiff;
      if (b.match_score !== a.match_score) return b.match_score - a.match_score;
      const createdB = new Date(b.created_at || 0).getTime();
      const createdA = new Date(a.created_at || 0).getTime();
      return createdB - createdA;
    });
  }
}

export const rankingService = new RankingService();
