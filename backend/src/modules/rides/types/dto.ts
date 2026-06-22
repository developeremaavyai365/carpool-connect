/** Data transfer objects for rides API */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PublishTripDto {
  source_label: string;
  dest_label: string;
  source_lat: number;
  source_lng: number;
  dest_lat: number;
  dest_lng: number;
  departure_at: string;
  seats_available: number;
  price_per_seat: number;
  city?: string;
  commute_id?: number;
  stopover_coords?: Array<{ lat: number; lng: number } | [number, number]>;
}

export interface SearchRidesDto {
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  date?: string;
  seats?: number;
}

export type MatchType = 'exact' | 'nearby' | 'recommended';

export interface BookTripDto {
  trip_id: number;
  seats?: number;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  pickup_label?: string;
  drop_label?: string;
}

export interface TripRow {
  id: number;
  driver_id: number;
  source_label: string;
  dest_label: string;
  source_lat: number;
  source_lng: number;
  dest_lat: number;
  dest_lng: number;
  city: string;
  departure_at: string;
  seats_total: number;
  seats_available: number;
  price_per_seat: number;
  route_distance_m: number | null;
  route_duration_s: number | null;
  route_polyline: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  coverage_points?: unknown;
  matching_radius_m?: number;
  driver_name?: string;
  driver_rating?: number;
  cancellation_count?: number;
}

export interface RankedTrip extends TripRow {
  match_score: number;
  match_type: MatchType;
  pickup_position: number;
  drop_position: number;
  pickup_proximity_km: number;
  dest_proximity_km: number;
  detour_km: number;
  matching_radius_km?: number;
}

export interface RouteResult {
  polyline: string;
  coordinates: [number, number][];
  distance_m: number;
  duration_s: number;
  lineWkt: string;
}

export interface BookingRow {
  id: number;
  trip_id: number;
  passenger_id: number;
  seats: number;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  pickup_label: string;
  drop_label: string;
  price_total: number;
  status: string;
  created_at: string;
}

export interface AuthUser {
  id: number;
  email?: string;
  name?: string;
}
