import { isPublicListingCommute } from './commuteFilters';

const MATCH_TYPE_ORDER = { exact: 0, nearby: 1, recommended: 2 };

/**
 * Sort public commute listings:
 * 1. Match type (exact → nearby → recommended) in geospatial mode
 * 2. Best match score
 * 3. Newest published
 * 4. Soonest departure
 */
export function sortCommutesForListing(commutes, { geospatialMode = false } = {}) {
  return [...(commutes || [])]
    .filter(isPublicListingCommute)
    .sort((a, b) => {
      if (geospatialMode && a.match_type && b.match_type) {
        const typeDiff = (MATCH_TYPE_ORDER[a.match_type] ?? 9) - (MATCH_TYPE_ORDER[b.match_type] ?? 9);
        if (typeDiff !== 0) return typeDiff;
      }

      if (geospatialMode && a.match_score != null && b.match_score != null) {
        const scoreDiff = Number(b.match_score) - Number(a.match_score);
        if (scoreDiff !== 0) return scoreDiff;
      }

      const createdB = new Date(b.created_at || b.updated_at || 0).getTime();
      const createdA = new Date(a.created_at || a.updated_at || 0).getTime();
      if (createdB !== createdA) return createdB - createdA;

      return new Date(a.departure_at || 0) - new Date(b.departure_at || 0);
    });
}

export function mergeCommuteIntoList(list, commute, options) {
  const without = list.filter((c) => c.id !== commute.id);
  return sortCommutesForListing([commute, ...without], options);
}

export function removeCommuteFromList(list, commuteId) {
  return list.filter((c) => String(c.id) !== String(commuteId));
}

/** Driver/passenger history lists — newest first, no public-only filter. */
export function sortCommutesByCreated(commutes) {
  return [...(commutes || [])].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  );
}
