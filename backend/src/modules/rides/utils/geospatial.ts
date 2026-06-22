import type { LatLng } from '../types/dto';
import { ROUTE_PROXIMITY_M } from '../config/constants';

/** Haversine distance in meters */
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Returns normalized position [0,1] of point along route polyline coordinates.
 * Uses nearest vertex segment projection (works with ORS coordinate arrays).
 */
export function getRoutePosition(
  point: LatLng,
  routeCoords: [number, number][],
): number {
  if (!routeCoords.length) return -1;
  if (routeCoords.length === 1) {
    return haversineM(point, { lat: routeCoords[0][1], lng: routeCoords[0][0] }) <= ROUTE_PROXIMITY_M ? 0 : -1;
  }

  let bestDist = Infinity;
  let bestPos = -1;
  let cumulative = 0;
  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < routeCoords.length - 1; i += 1) {
    const a = { lat: routeCoords[i][1], lng: routeCoords[i][0] };
    const b = { lat: routeCoords[i + 1][1], lng: routeCoords[i + 1][0] };
    const len = haversineM(a, b);
    segmentLengths.push(len);
    totalLength += len;
  }

  cumulative = 0;
  for (let i = 0; i < routeCoords.length - 1; i += 1) {
    const a = { lat: routeCoords[i][1], lng: routeCoords[i][0] };
    const b = { lat: routeCoords[i + 1][1], lng: routeCoords[i + 1][0] };
    const segLen = segmentLengths[i];
    const distToA = haversineM(point, a);
    const distToB = haversineM(point, b);
    const dist = Math.min(distToA, distToB);

    if (dist < bestDist) {
      bestDist = dist;
      const t = segLen > 0 ? distToA / (distToA + distToB + 1e-9) : 0;
      bestPos = totalLength > 0 ? (cumulative + t * segLen) / totalLength : 0;
    }
    cumulative += segLen;
  }

  return bestDist <= ROUTE_PROXIMITY_M ? Math.max(0, Math.min(1, bestPos)) : -1;
}

/** True if point is within radiusM of any segment on the route polyline */
export function isPointOnRoute(
  point: LatLng,
  routeCoords: [number, number][],
  radiusM = ROUTE_PROXIMITY_M,
): boolean {
  return getRoutePosition(point, routeCoords) >= 0
    || minDistanceToRouteM(point, routeCoords) <= radiusM;
}

function minDistanceToRouteM(point: LatLng, routeCoords: [number, number][]): number {
  if (!routeCoords.length) return Infinity;
  let min = Infinity;
  for (const [lng, lat] of routeCoords) {
    min = Math.min(min, haversineM(point, { lat, lng }));
  }
  for (let i = 0; i < routeCoords.length - 1; i += 1) {
    const a = { lat: routeCoords[i][1], lng: routeCoords[i][0] };
    const b = { lat: routeCoords[i + 1][1], lng: routeCoords[i + 1][0] };
    min = Math.min(min, pointToSegmentDistanceM(point, a, b));
  }
  return min;
}

function pointToSegmentDistanceM(p: LatLng, a: LatLng, b: LatLng): number {
  const dAB = haversineM(a, b);
  if (dAB < 1) return haversineM(p, a);
  const dAP = haversineM(a, p);
  const dBP = haversineM(b, p);
  return Math.min(dAP, dBP);
}

/** Passenger path must lie inside driver path: pickup before drop on route */
export function isPassengerPathOnDriverRoute(
  pickup: LatLng,
  drop: LatLng,
  routeCoords: [number, number][],
): boolean {
  const pickupPos = getRoutePosition(pickup, routeCoords);
  const dropPos = getRoutePosition(drop, routeCoords);
  if (pickupPos < 0 || dropPos < 0) return false;
  return pickupPos < dropPos - 0.001;
}

/** Build WKT LINESTRING for PostGIS from [lng,lat] coordinates */
export function coordsToLineWkt(coords: [number, number][]): string {
  const pts = coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `SRID=4326;LINESTRING(${pts})`;
}

export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}
