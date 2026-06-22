/** Google Maps dark/light styles aligned with Carpool Connect theme */

export const MAP_LIGHT_STYLE = [];

export const MAP_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
];

export function mapStylesForTheme(theme) {
  return theme === 'dark' ? MAP_DARK_STYLE : MAP_LIGHT_STYLE;
}

export const DEFAULT_MAP_CENTER = { lat: 28.6139, lng: 77.209 };

export const INDIA_BOUNDS = {
  north: 35.7,
  south: 6.5,
  east: 97.4,
  west: 68.1,
};

export function toLatLng(coords) {
  if (!coords) return null;
  if (Array.isArray(coords) && coords.length >= 2) {
    return { lat: Number(coords[0]), lng: Number(coords[1]) };
  }
  if (typeof coords === 'object' && coords.lat != null && coords.lng != null) {
    return { lat: Number(coords.lat), lng: Number(coords.lng) };
  }
  return null;
}

export function pathFromPolyline(polyline) {
  if (!polyline) return [];
  if (typeof polyline === 'string') {
    return decodeEncodedPolyline(polyline);
  }
  if (!Array.isArray(polyline)) return [];
  return polyline.map(toLatLng).filter(Boolean);
}

/** Decode Google encoded polyline string to LatLng[] */
export function decodeEncodedPolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  if (window.google?.maps?.geometry?.encoding) {
    try {
      return window.google.maps.geometry.encoding.decodePath(encoded);
    } catch {
      return [];
    }
  }
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function commuteRoutePath(commute) {
  if (!commute) return [];
  const poly = pathFromPolyline(commute.polyline || commute.route_polyline);
  if (poly.length >= 2) return poly;
  const from = toLatLng([
    commute.pickup_lat ?? commute.source_lat,
    commute.pickup_lng ?? commute.source_lng,
  ]);
  const to = toLatLng([
    commute.destination_lat ?? commute.dest_lat,
    commute.destination_lng ?? commute.dest_lng,
  ]);
  const stops = (commute.stopover_coords || []).map(toLatLng).filter(Boolean);
  if (from && to) return [from, ...stops, to];
  return [];
}
