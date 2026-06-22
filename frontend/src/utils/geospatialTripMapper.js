/** Map PostGIS trip row from /api/rides/search to CommuteCard shape */
export function tripToCommuteCard(trip) {
  if (!trip?.id) return null;
  const commuteId = trip.commute_id ?? trip.id;
  const matchLabels = {
    exact: 'Exact match',
    nearby: 'Nearby match',
    recommended: 'Recommended',
  };
  return {
    id: commuteId,
    trip_id: trip.id,
    commute_id: trip.commute_id ?? null,
    driver_id: trip.driver_id,
    driver_name: trip.driver_name || 'Driver',
    route_from: trip.source_label || trip.route_from,
    route_to: trip.dest_label || trip.route_to,
    city: trip.city || '',
    departure_at: trip.departure_at,
    seats_available: trip.seats_available,
    price_per_seat: trip.price_per_seat ?? 0,
    status: trip.status || 'active',
    created_at: trip.created_at,
    match_score: trip.match_score,
    match_type: trip.match_type || 'recommended',
    match_type_label: matchLabels[trip.match_type] || matchLabels.recommended,
    pickup_proximity_km: trip.pickup_proximity_km,
    dest_proximity_km: trip.dest_proximity_km,
    matching_radius_km: trip.matching_radius_km,
    detour_km: trip.detour_km,
    pickup_lat: trip.pickup_lat ?? trip.source_lat ?? null,
    pickup_lng: trip.pickup_lng ?? trip.source_lng ?? null,
    destination_lat: trip.destination_lat ?? trip.dest_lat ?? null,
    destination_lng: trip.destination_lng ?? trip.dest_lng ?? null,
    source_lat: trip.source_lat ?? trip.pickup_lat ?? null,
    source_lng: trip.source_lng ?? trip.pickup_lng ?? null,
    dest_lat: trip.dest_lat ?? trip.destination_lat ?? null,
    dest_lng: trip.dest_lng ?? trip.destination_lng ?? null,
    route_polyline: trip.route_polyline ?? null,
    distance_km: trip.distance_km ?? (trip.route_distance_m != null ? trip.route_distance_m / 1000 : null),
    estimated_duration: trip.estimated_duration ?? trip.route_duration_s ?? null,
    geospatial: true,
  };
}

export function matchTypeSectionLabel(type) {
  const labels = {
    exact: 'Exact matches',
    nearby: 'Nearby matches',
    recommended: 'Recommended matches',
  };
  return labels[type] || 'Matches';
}
