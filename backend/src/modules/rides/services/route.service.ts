import type { LatLng, RouteResult } from '../types/dto';
import { coordsToLineWkt } from '../utils/geospatial';
import { routeCacheRepository } from '../repositories/route-cache.repository';

const ORS_BASE = process.env.OPENROUTESERVICE_BASE_URL || 'https://api.openrouteservice.org';

/**
 * Fetches driving route from cache, OpenRouteService (preferred), or OSRM fallback.
 */
export class RouteService {
  async getRoute(source: LatLng, dest: LatLng): Promise<RouteResult> {
    const cached = await routeCacheRepository.find(
      source.lat, source.lng, dest.lat, dest.lng,
    ).catch(() => null);

    if (cached) {
      return {
        polyline: cached.polyline,
        coordinates: [],
        distance_m: cached.distance_m,
        duration_s: cached.duration_s,
        lineWkt: cached.line_wkt,
      };
    }

    const orsKey = process.env.OPENROUTESERVICE_API_KEY;
    let result: RouteResult;
    let provider = 'osrm';

    if (orsKey) {
      try {
        result = await this.fetchOpenRouteService(source, dest, orsKey);
        provider = 'ors';
      } catch (err) {
        console.warn('[RouteService] ORS failed, falling back to OSRM:', (err as Error).message);
        result = await this.fetchOsrm(source, dest);
      }
    } else {
      result = await this.fetchOsrm(source, dest);
    }

    await routeCacheRepository.save(
      source.lat, source.lng, dest.lat, dest.lng,
      {
        polyline: result.polyline,
        distance_m: result.distance_m,
        duration_s: result.duration_s,
        lineWkt: result.lineWkt,
      },
      provider,
    ).catch(() => {});

    return result;
  }

  private async fetchOpenRouteService(
    source: LatLng,
    dest: LatLng,
    apiKey: string,
  ): Promise<RouteResult> {
    const res = await fetch(`${ORS_BASE}/v2/directions/driving-car/geojson`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [[source.lng, source.lat], [dest.lng, dest.lat]],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      throw new Error(`OpenRouteService error ${res.status}`);
    }

    const data = await res.json() as {
      features?: Array<{
        geometry?: { coordinates?: [number, number][] };
        properties?: { summary?: { distance?: number; duration?: number } };
      }>;
    };

    const feature = data.features?.[0];
    const coordinates = feature?.geometry?.coordinates || [];
    if (coordinates.length < 2) throw new Error('Invalid ORS route');

    const distance_m = Math.round(feature?.properties?.summary?.distance ?? 0);
    const duration_s = Math.round(feature?.properties?.summary?.duration ?? 0);
    const polyline = encodePolyline(coordinates);

    return {
      polyline,
      coordinates,
      distance_m,
      duration_s,
      lineWkt: coordsToLineWkt(coordinates),
    };
  }

  private async fetchOsrm(source: LatLng, dest: LatLng): Promise<RouteResult> {
    const url = `https://router.project-osrm.org/route/v1/driving/${source.lng},${source.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`OSRM error ${res.status}`);

    const data = await res.json() as {
      routes?: Array<{
        geometry?: { coordinates?: [number, number][] };
        distance?: number;
        duration?: number;
      }>;
    };

    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates || [];
    if (coordinates.length < 2) throw new Error('Invalid OSRM route');

    return {
      polyline: encodePolyline(coordinates),
      coordinates,
      distance_m: Math.round(route?.distance ?? 0),
      duration_s: Math.round(route?.duration ?? 0),
      lineWkt: coordsToLineWkt(coordinates),
    };
  }
}

function encodePolyline(coords: [number, number][]): string {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  for (const [lng, lat] of coords) {
    const ilat = Math.round(lat * 1e5);
    const ilng = Math.round(lng * 1e5);
    result += encodeSigned(ilat - lastLat);
    result += encodeSigned(ilng - lastLng);
    lastLat = ilat;
    lastLng = ilng;
  }
  return result;
}

function encodeSigned(num: number): string {
  let s = num << 1;
  if (num < 0) s = ~s;
  let out = '';
  while (s >= 0x20) {
    out += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
    s >>= 5;
  }
  out += String.fromCharCode(s + 63);
  return out;
}

export const routeService = new RouteService();
