import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';
import { commuteRoutePath, toLatLng } from '../../utils/googleMapStyles';
import { tripToCommuteCard } from '../../utils/geospatialTripMapper';
import './RideDiscoveryMap.css';

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_CENTER = [28.6139, 77.209];

function markerPosition(commute) {
  return toLatLng([
    commute.pickup_lat ?? commute.source_lat,
    commute.pickup_lng ?? commute.source_lng,
  ]);
}

function toLatLngPair(coords) {
  const pt = toLatLng(coords);
  return pt ? [pt.lat, pt.lng] : null;
}

export default function RideDiscoveryMapLeaflet({
  commutes = [],
  selectedId = null,
  onSelectCommute,
  userPosition = null,
  className = '',
}) {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const markers = commutes.map((c) => {
    const card = c.geospatial ? c : tripToCommuteCard(c) || c;
    const pos = markerPosition(card);
    if (!pos) return null;
    return { commute: card, position: pos };
  }).filter(Boolean);

  const selected = markers.find((m) => String(m.commute.id) === String(selectedId));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 11,
      zoomControl: true,
    });

    L.tileLayer(theme === 'dark' ? DARK_TILES : LIGHT_TILES, {
      attribution: '&copy; OpenStreetMap / CARTO',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (userPosition?.lat != null) {
      L.circleMarker([userPosition.lat, userPosition.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 1,
      }).bindTooltip('Your location').addTo(group);
    }

    for (const { commute, position } of markers) {
      const isSelected = String(commute.id) === String(selectedId);
      const marker = L.circleMarker([position.lat, position.lng], {
        radius: isSelected ? 12 : 9,
        color: '#fff',
        weight: 2,
        fillColor: isSelected ? '#22c55e' : '#38bdf8',
        fillOpacity: 1,
      });
      marker.bindTooltip(`${commute.route_from} → ${commute.route_to}`);
      marker.on('click', () => onSelectCommute?.(commute));
      marker.addTo(group);
    }

    if (selected) {
      const route = commuteRoutePath(selected.commute);
      const line = route.map(toLatLngPair).filter(Boolean);
      if (line.length >= 2) {
        L.polyline(line, { color: '#22c55e', weight: 4, opacity: 0.9 }).addTo(group);
        try {
          map.fitBounds(L.latLngBounds(line), { padding: [48, 48] });
        } catch { /* ignore */ }
      } else {
        map.setView([selected.position.lat, selected.position.lng], 13);
      }
    } else if (markers.length >= 2) {
      try {
        map.fitBounds(
          L.latLngBounds(markers.map((m) => [m.position.lat, m.position.lng])),
          { padding: [48, 48] },
        );
      } catch { /* ignore */ }
    } else if (markers.length === 1) {
      map.setView([markers[0].position.lat, markers[0].position.lng], 12);
    } else if (userPosition?.lat != null) {
      map.setView([userPosition.lat, userPosition.lng], 12);
    }
  }, [markers, selected, selectedId, userPosition, onSelectCommute]);

  return (
    <div className={`ride-discovery-map ${className}`}>
      <div ref={containerRef} className="ride-discovery-map-canvas" aria-label="Ride discovery map" />
    </div>
  );
}
