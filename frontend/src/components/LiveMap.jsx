import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';

const DEFAULT_CENTER = [19.076, 72.8777];

const userIcon = L.divIcon({
  className: 'live-map-marker live-map-marker-you',
  html: '<span>You</span>',
  iconSize: [48, 28],
  iconAnchor: [24, 14],
});

const colleagueIcon = L.divIcon({
  className: 'live-map-marker live-map-marker-colleague',
  html: '<span></span>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export default function LiveMap({
  position,
  colleagues = [],
  className = '',
  interactive = true,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ user: null, colleagues: new Map(), accuracy: null });
  const didFitRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 12,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = { user: null, colleagues: new Map(), accuracy: null };
      didFitRef.current = false;
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (position?.lat != null && position?.lng != null) {
      const latlng = [position.lat, position.lng];

      if (!markersRef.current.user) {
        markersRef.current.user = L.marker(latlng, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        markersRef.current.user.setLatLng(latlng);
      }

      if (position.accuracy) {
        if (!markersRef.current.accuracy) {
          markersRef.current.accuracy = L.circle(latlng, {
            radius: position.accuracy,
            color: '#2563eb',
            fillOpacity: 0.08,
          }).addTo(map);
        } else {
          markersRef.current.accuracy.setLatLng(latlng);
          markersRef.current.accuracy.setRadius(position.accuracy);
        }
      }

      if (!didFitRef.current) {
        map.setView(latlng, 14, { animate: true });
        didFitRef.current = true;
      } else {
        map.panTo(latlng, { animate: true, duration: 0.5 });
      }
    }

    const seen = new Set();
    colleagues.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      seen.add(String(c.userId));
      const latlng = [c.lat, c.lng];
      let marker = markersRef.current.colleagues.get(String(c.userId));
      if (!marker) {
        marker = L.marker(latlng, {
          icon: colleagueIcon,
          title: c.name || 'Colleague',
        }).addTo(map);
        marker.bindPopup(`<strong>${c.name || 'Colleague'}</strong>${c.route_from ? `<br>${c.route_from}` : ''}`);
        markersRef.current.colleagues.set(String(c.userId), marker);
      } else {
        marker.setLatLng(latlng);
      }
    });

    markersRef.current.colleagues.forEach((marker, id) => {
      if (!seen.has(id)) {
        map.removeLayer(marker);
        markersRef.current.colleagues.delete(id);
      }
    });
  }, [position, colleagues]);

  return <div ref={containerRef} className={`live-map ${className}`} aria-label="Live location map" />;
}
