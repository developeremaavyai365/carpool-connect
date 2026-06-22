/** Flexible route/location matching for commute search filters. */

import { isCommuteOwnedByUser } from './commuteOwnership';

function normalize(text) {
  return (text || '').toLowerCase().trim();
}

function significantTokens(text) {
  return normalize(text)
    .split(/[,|/]+|\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

export function routeMatchesFilter(query, routeText) {
  const q = normalize(query);
  if (!q) return true;

  const r = normalize(routeText);
  if (!r) return false;
  if (r.includes(q) || q.includes(r)) return true;

  const qTokens = significantTokens(q);
  if (!qTokens.length) return r.includes(q);

  return qTokens.some((token) => r.includes(token));
}

function buildRouteChain(commute) {
  const stopovers = Array.isArray(commute?.stopovers) ? commute.stopovers : [];
  return [commute?.route_from, ...stopovers, commute?.route_to].filter(Boolean);
}

function commuteMatchesRouteFilters(routeFrom, routeTo, commute) {
  const chain = buildRouteChain(commute);
  if (!routeFrom && !routeTo) return true;

  if (routeFrom && routeTo) {
    let fromIdx = -1;
    let toIdx = -1;
    chain.forEach((label, i) => {
      if (fromIdx < 0 && routeMatchesFilter(routeFrom, label)) fromIdx = i;
      if (routeMatchesFilter(routeTo, label)) toIdx = i;
    });
    return fromIdx >= 0 && toIdx > fromIdx;
  }

  if (routeFrom) {
    return chain.some((label) => routeMatchesFilter(routeFrom, label));
  }

  return chain.some((label) => routeMatchesFilter(routeTo, label));
}

function cityMatchesFilter(filterCity, rideCity) {
  if (!filterCity?.trim()) return true;
  const c = filterCity.trim().toLowerCase();
  const rc = (rideCity || '').toLowerCase();
  if (!rc) return false;
  return rc.includes(c) || c.includes(rc);
}

const HIDDEN_STATUSES = new Set(['cancelled', 'expired', 'completed']);

/** Public listings: active/upcoming only, with seats, not expired. */
export function isPublicListingCommute(commute) {
  if (!commute) return false;
  const status = normalize(commute.status || 'active');
  if (HIDDEN_STATUSES.has(status)) return false;
  if (status !== 'active' && status !== 'upcoming') return false;

  const seats = Number(commute.seats_available ?? 0);
  if (seats <= 0) return false;

  if (commute.departure_at && new Date(commute.departure_at).getTime() < Date.now() - 60000) {
    return false;
  }

  return true;
}

/** Returns true if a published ride matches browse/search filters. */
export function commuteMatchesBrowseFilters(commute, {
  userId,
  routeFrom = '',
  routeTo = '',
  date = '',
  city = '',
} = {}) {
  if (!isPublicListingCommute(commute)) return false;
  if (userId != null && isCommuteOwnedByUser(commute, userId)) return false;

  if (!cityMatchesFilter(city, commute.city)) return false;
  if (!commuteMatchesRouteFilters(routeFrom, routeTo, commute)) return false;

  if (date) {
    const day = String(commute.departure_at || '').slice(0, 10);
    if (day !== date) return false;
  }

  return true;
}

export function normalizeStopoverLabel(label) {
  return String(label || '').trim().replace(/\s+/g, ' ');
}

export function isValidStopover(label) {
  const t = normalizeStopoverLabel(label);
  return t.length >= 2 && t.length <= 80;
}

export function dedupeStopovers(stopovers) {
  const seen = new Set();
  const out = [];
  for (const raw of stopovers || []) {
    const label = normalizeStopoverLabel(raw);
    if (!isValidStopover(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}
