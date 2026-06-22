/** Merge text (published_commutes) and geospatial (trips) search results without duplicates. */
export function mergeSearchResults(textCommutes = [], geoCommutes = []) {
  const byKey = new Map();

  for (const commute of textCommutes) {
    if (!commute?.id) continue;
    byKey.set(String(commute.id), { ...commute });
  }

  for (const geo of geoCommutes) {
    if (!geo?.id) continue;
    const key = String(geo.commute_id ?? geo.id);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        ...geo,
        id: existing.id,
        trip_id: geo.trip_id ?? existing.trip_id ?? null,
        match_type: geo.match_type ?? existing.match_type,
        match_type_label: geo.match_type_label ?? existing.match_type_label,
        pickup_proximity_km: geo.pickup_proximity_km ?? existing.pickup_proximity_km,
        dest_proximity_km: geo.dest_proximity_km ?? existing.dest_proximity_km,
        matching_radius_km: geo.matching_radius_km ?? existing.matching_radius_km,
        match_score: geo.match_score ?? existing.match_score,
        detour_km: geo.detour_km ?? existing.detour_km,
        geospatial: true,
      });
    } else {
      byKey.set(key, geo);
    }
  }

  return Array.from(byKey.values());
}
