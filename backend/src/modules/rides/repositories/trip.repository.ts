import { query, queryOne } from './pg.client';
import type { TripRow, PublishTripDto, SearchRidesDto } from '../types/dto';
import type { CoveragePoint } from '../utils/coverage';
import { MATCHING_RADIUS_M } from '../config/constants';

interface TripCoverageMeta {
  coverage_points: CoveragePoint[];
  coverage_wkt: string;
  matching_radius_m: number;
}

export class TripRepository {
  async create(
    driverId: number,
    dto: PublishTripDto,
    route: {
      distance_m: number;
      duration_s: number;
      polyline: string;
      lineWkt: string;
    },
    coverage: TripCoverageMeta,
  ): Promise<TripRow> {
    const row = await queryOne<TripRow>(
      `INSERT INTO trips (
        driver_id, source_label, dest_label,
        source_lat, source_lng, dest_lat, dest_lng, city,
        departure_at, seats_total, seats_available, price_per_seat,
        route_distance_m, route_duration_s, route_polyline, route_geometry,
        commute_id, coverage_points, matching_radius_m, coverage_geog
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,
        ST_GeogFromText($15), $16, $17::jsonb, $18, ST_GeogFromText($19)
      )
      RETURNING *`,
      [
        driverId,
        dto.source_label,
        dto.dest_label,
        dto.source_lat,
        dto.source_lng,
        dto.dest_lat,
        dto.dest_lng,
        dto.city || '',
        dto.departure_at,
        dto.seats_available,
        dto.price_per_seat,
        route.distance_m,
        route.duration_s,
        route.polyline,
        route.lineWkt,
        dto.commute_id ?? null,
        JSON.stringify(coverage.coverage_points),
        coverage.matching_radius_m,
        coverage.coverage_wkt,
      ],
    );
    if (!row) throw new Error('Failed to create trip');

    await query(
      `INSERT INTO driver_profiles (user_id, total_trips)
       VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE SET total_trips = driver_profiles.total_trips + 1, updated_at = now()`,
      [driverId],
    );

    return row;
  }

  async findById(id: number): Promise<TripRow | null> {
    return queryOne<TripRow>(
      `SELECT t.*, u.name AS driver_name,
              COALESCE(dp.rating_avg, 5.0) AS driver_rating,
              COALESCE(dp.cancellation_count, 0) AS cancellation_count
       FROM trips t
       JOIN users u ON u.id = t.driver_id
       LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id
       WHERE t.id = $1`,
      [id],
    );
  }

  /**
   * PostGIS radius search:
   * - pickup & drop within matching_radius_m of coverage waypoints (source/stopovers/dest)
   * - OR within radius of route line (fallback)
   * - pickup before drop on route line (direction)
   * - active trips with seats
   */
  async searchCorridor(params: SearchRidesDto): Promise<TripRow[]> {
    const { pickup_lat, pickup_lng, drop_lat, drop_lng } = params;
    const seats = params.seats ?? 1;
    const defaultRadius = MATCHING_RADIUS_M;

    let dateFilter = '';
    const values: unknown[] = [
      pickup_lng, pickup_lat,
      drop_lng, drop_lat,
      defaultRadius,
      defaultRadius,
      seats,
    ];

    if (params.date) {
      dateFilter = `AND t.departure_at >= $8::date AND t.departure_at < ($8::date + interval '1 day')`;
      values.push(params.date);
    }

    return query<TripRow>(
      `SELECT t.*, u.name AS driver_name,
              COALESCE(dp.rating_avg, 5.0) AS driver_rating,
              COALESCE(dp.cancellation_count, 0) AS cancellation_count,
              ST_LineLocatePoint(
                t.route_geometry::geometry,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)
              ) AS pickup_position,
              ST_LineLocatePoint(
                t.route_geometry::geometry,
                ST_SetSRID(ST_MakePoint($3, $4), 4326)
              ) AS drop_position
       FROM trips t
       JOIN users u ON u.id = t.driver_id
       LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id
       WHERE t.status = 'active'
         AND t.seats_available >= $7
         AND t.departure_at >= now()
         AND (
           (
             t.coverage_geog IS NOT NULL
             AND ST_DWithin(
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               t.coverage_geog,
               COALESCE(t.matching_radius_m, $5)
             )
             AND ST_DWithin(
               ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
               t.coverage_geog,
               COALESCE(t.matching_radius_m, $6)
             )
           )
           OR (
             t.route_geometry IS NOT NULL
             AND ST_DWithin(
               t.route_geometry,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               COALESCE(t.matching_radius_m, $5)
             )
             AND ST_DWithin(
               t.route_geometry,
               ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
               COALESCE(t.matching_radius_m, $6)
             )
           )
         )
         AND (
           t.route_geometry IS NULL
           OR ST_LineLocatePoint(t.route_geometry::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
             < ST_LineLocatePoint(t.route_geometry::geometry, ST_SetSRID(ST_MakePoint($3, $4), 4326))
         )
         ${dateFilter}
       ORDER BY t.created_at DESC, t.departure_at ASC
       LIMIT 100`,
      values,
    );
  }

  async listActive(): Promise<TripRow[]> {
    return query<TripRow>(
      `SELECT t.*, u.name AS driver_name
       FROM trips t JOIN users u ON u.id = t.driver_id
       WHERE t.status = 'active' AND t.departure_at >= now()
       ORDER BY t.departure_at ASC LIMIT 500`,
    );
  }

  async cancelByCommuteId(commuteId: number, driverId: number): Promise<void> {
    await query(
      `UPDATE trips SET status = 'cancelled', updated_at = now()
       WHERE commute_id = $1 AND driver_id = $2 AND status = 'active'`,
      [commuteId, driverId],
    );
  }

  async updateByCommuteId(
    driverId: number,
    commuteId: number,
    dto: PublishTripDto,
    route: {
      distance_m: number;
      duration_s: number;
      polyline: string;
      lineWkt: string;
    },
    coverage: TripCoverageMeta,
  ): Promise<TripRow | null> {
    return queryOne<TripRow>(
      `UPDATE trips SET
        source_label = $3, dest_label = $4,
        source_lat = $5, source_lng = $6, dest_lat = $7, dest_lng = $8,
        city = $9, departure_at = $10,
        seats_total = $11, seats_available = LEAST(seats_available, $11),
        price_per_seat = $12,
        route_distance_m = $13, route_duration_s = $14,
        route_polyline = $15, route_geometry = ST_GeogFromText($16),
        coverage_points = $17::jsonb,
        matching_radius_m = $18,
        coverage_geog = ST_GeogFromText($19),
        updated_at = now()
       WHERE commute_id = $1 AND driver_id = $2 AND status = 'active'
       RETURNING *`,
      [
        commuteId,
        driverId,
        dto.source_label,
        dto.dest_label,
        dto.source_lat,
        dto.source_lng,
        dto.dest_lat,
        dto.dest_lng,
        dto.city || '',
        dto.departure_at,
        dto.seats_available,
        dto.price_per_seat,
        route.distance_m,
        route.duration_s,
        route.polyline,
        route.lineWkt,
        JSON.stringify(coverage.coverage_points),
        coverage.matching_radius_m,
        coverage.coverage_wkt,
      ],
    );
  }

  async cancel(id: number, driverId: number): Promise<TripRow | null> {
    return queryOne<TripRow>(
      `UPDATE trips SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND driver_id = $2 RETURNING *`,
      [id, driverId],
    );
  }
}

export const tripRepository = new TripRepository();
