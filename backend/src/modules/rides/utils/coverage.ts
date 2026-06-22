import type { LatLng } from '../types/dto';
import { haversineM } from './geospatial';
import { EXACT_MATCH_KM, NEARBY_MATCH_KM } from '../config/constants';

export type CoverageRole = 'source' | 'stopover' | 'destination';

export interface CoveragePoint {
  lat: number;
  lng: number;
  idx: number;
  role: CoverageRole;
  label?: string;
}

export type MatchType = 'exact' | 'nearby' | 'recommended';

export interface CoverageMatchResult {
  ok: boolean;
  pickupIdx: number;
  dropIdx: number;
  pickupKm: number;
  dropKm: number;
  matchType: MatchType;
}

type StopoverInput = { lat: number; lng: number } | [number, number];

function normalizeStopover(coord: StopoverInput): LatLng {
  if (Array.isArray(coord)) {
    return { lat: coord[0], lng: coord[1] };
  }
  return { lat: coord.lat, lng: coord.lng };
}

/** Build ordered coverage waypoints: source → stopovers → destination */
export function buildCoveragePoints(
  source: LatLng,
  dest: LatLng,
  stopoverCoords: StopoverInput[] = [],
): CoveragePoint[] {
  const points: CoveragePoint[] = [
    { lat: source.lat, lng: source.lng, idx: 0, role: 'source' },
  ];

  stopoverCoords.forEach((coord, i) => {
    const { lat, lng } = normalizeStopover(coord);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    points.push({ lat, lng, idx: i + 1, role: 'stopover' });
  });

  points.push({
    lat: dest.lat,
    lng: dest.lng,
    idx: points.length,
    role: 'destination',
  });

  return points.map((p, idx) => ({ ...p, idx }));
}

export function coverageToMultiPointWkt(points: CoveragePoint[]): string {
  const pts = points.map((p) => `${p.lng} ${p.lat}`).join(', ');
  return `SRID=4326;MULTIPOINT(${pts})`;
}

export function parseCoveragePoints(raw: unknown): CoveragePoint[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return parseCoveragePoints(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p, i) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      idx: Number.isFinite(p.idx) ? p.idx : i,
      role: (p.role || 'stopover') as CoverageRole,
      label: p.label,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export function findNearestCoveragePoint(
  point: LatLng,
  coverage: CoveragePoint[],
  radiusM: number,
): { point: CoveragePoint; distanceM: number } | null {
  let best: { point: CoveragePoint; distanceM: number } | null = null;
  for (const cp of coverage) {
    const distanceM = haversineM(point, cp);
    if (distanceM <= radiusM && (!best || distanceM < best.distanceM)) {
      best = { point: cp, distanceM };
    }
  }
  return best;
}

export function classifyMatchType(pickupKm: number, dropKm: number): MatchType {
  if (pickupKm <= EXACT_MATCH_KM && dropKm <= EXACT_MATCH_KM) return 'exact';
  if (pickupKm <= NEARBY_MATCH_KM || dropKm <= NEARBY_MATCH_KM) return 'nearby';
  return 'recommended';
}

/**
 * Passenger pickup must match a coverage point before drop along the driver's route.
 * Prevents reverse-direction matches (e.g. Jaipur → Gurgaon on Delhi → Jaipur).
 */
export function isPassengerPathOnCoverage(
  pickup: LatLng,
  drop: LatLng,
  coverage: CoveragePoint[],
  radiusM: number,
): CoverageMatchResult {
  const fail = (): CoverageMatchResult => ({
    ok: false,
    pickupIdx: -1,
    dropIdx: -1,
    pickupKm: Infinity,
    dropKm: Infinity,
    matchType: 'recommended',
  });

  if (coverage.length < 2) return fail();

  const pickupHit = findNearestCoveragePoint(pickup, coverage, radiusM);
  const dropHit = findNearestCoveragePoint(drop, coverage, radiusM);
  if (!pickupHit || !dropHit) return fail();

  const pickupIdx = pickupHit.point.idx;
  const dropIdx = dropHit.point.idx;
  if (pickupIdx >= dropIdx) return fail();

  const pickupKm = Math.round((pickupHit.distanceM / 1000) * 10) / 10;
  const dropKm = Math.round((dropHit.distanceM / 1000) * 10) / 10;

  return {
    ok: true,
    pickupIdx,
    dropIdx,
    pickupKm,
    dropKm,
    matchType: classifyMatchType(pickupKm, dropKm),
  };
}
