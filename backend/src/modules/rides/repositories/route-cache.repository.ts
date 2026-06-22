import { query, queryOne } from './pg.client';

export class RouteCacheRepository {
  async find(sourceLat: number, sourceLng: number, destLat: number, destLng: number) {
    return queryOne<{
      polyline: string;
      distance_m: number;
      duration_s: number;
      line_wkt: string;
    }>(
      `SELECT polyline, distance_m, duration_s, line_wkt
       FROM route_cache
       WHERE round(source_lat::numeric, 4) = round($1::numeric, 4)
         AND round(source_lng::numeric, 4) = round($2::numeric, 4)
         AND round(dest_lat::numeric, 4) = round($3::numeric, 4)
         AND round(dest_lng::numeric, 4) = round($4::numeric, 4)
         AND expires_at > now()
       LIMIT 1`,
      [sourceLat, sourceLng, destLat, destLng],
    );
  }

  async save(
    sourceLat: number,
    sourceLng: number,
    destLat: number,
    destLng: number,
    route: { polyline: string; distance_m: number; duration_s: number; lineWkt: string },
    provider: string,
  ): Promise<void> {
    await query(
      `DELETE FROM route_cache
       WHERE round(source_lat::numeric, 4) = round($1::numeric, 4)
         AND round(source_lng::numeric, 4) = round($2::numeric, 4)
         AND round(dest_lat::numeric, 4) = round($3::numeric, 4)
         AND round(dest_lng::numeric, 4) = round($4::numeric, 4)`,
      [sourceLat, sourceLng, destLat, destLng],
    );
    await query(
      `INSERT INTO route_cache (
        source_lat, source_lng, dest_lat, dest_lng,
        polyline, distance_m, duration_s, line_wkt, provider
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        sourceLat, sourceLng, destLat, destLng,
        route.polyline, route.distance_m, route.duration_s, route.lineWkt, provider,
      ],
    );
  }
}

export const routeCacheRepository = new RouteCacheRepository();
