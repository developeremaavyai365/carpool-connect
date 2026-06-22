import type { RankedTrip, SearchRidesDto, TripRow } from '../types/dto';
import { tripRepository } from '../repositories/trip.repository';
import { cacheService } from './cache.service';
import { rankingService } from './ranking.service';
import { CACHE_TTL_SEARCH_SEC, MATCHING_RADIUS_KM } from '../config/constants';
import { decodePolyline, isPassengerPathOnDriverRoute } from '../utils/geospatial';
import { isPassengerPathOnCoverage, parseCoveragePoints } from '../utils/coverage';

interface VerifiedTrip extends TripRow {
  pickup_proximity_km?: number;
  dest_proximity_km?: number;
  match_type?: RankedTrip['match_type'];
  pickup_coverage_idx?: number;
  drop_coverage_idx?: number;
}

/**
 * Smart ride matching — PostGIS radius filter on coverage waypoints + route geometry,
 * direction verification, and weighted ranking.
 */
export class MatchingService {
  async search(params: SearchRidesDto, options: { excludeDriverId?: number } = {}): Promise<RankedTrip[]> {
    const cacheKey = cacheService.searchKey(params);
    const cached = await cacheService.get<RankedTrip[]>(cacheKey);
    if (cached) {
      return options.excludeDriverId != null
        ? cached.filter((t) => Number(t.driver_id) !== Number(options.excludeDriverId))
        : cached;
    }

    const candidates = await tripRepository.searchCorridor(params);
    const pickup = { lat: params.pickup_lat, lng: params.pickup_lng };
    const drop = { lat: params.drop_lat, lng: params.drop_lng };

    const verified: VerifiedTrip[] = candidates.filter((trip) => {
    if (options.excludeDriverId != null && Number(trip.driver_id) === Number(options.excludeDriverId)) return false;

      const coverage = parseCoveragePoints(trip.coverage_points);
      if (coverage.length >= 2) {
        const radiusM = trip.matching_radius_m ?? MATCHING_RADIUS_KM * 1000;
        const result = isPassengerPathOnCoverage(pickup, drop, coverage, radiusM);
        if (!result.ok) return false;
        (trip as VerifiedTrip).pickup_proximity_km = result.pickupKm;
        (trip as VerifiedTrip).dest_proximity_km = result.dropKm;
        (trip as VerifiedTrip).match_type = result.matchType;
        (trip as VerifiedTrip).pickup_coverage_idx = result.pickupIdx;
        (trip as VerifiedTrip).drop_coverage_idx = result.dropIdx;
        return true;
      }

      if (!trip.route_polyline) return false;
      const coords = decodePolyline(trip.route_polyline);
      if (!isPassengerPathOnDriverRoute(pickup, drop, coords)) return false;
      return true;
    });

    const ranked = rankingService.rankTrips(verified, params);

    await cacheService.set(cacheKey, ranked, CACHE_TTL_SEARCH_SEC);
    return ranked;
  }
}

export const matchingService = new MatchingService();
