import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './PublishRouteMap.css';

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

/** Approximate meters per degree latitude */
function metersToLatDegrees(meters) {
  return meters / 111320;
}

/** Normalize Leaflet inputs: [lat, lng] tuple or { lat, lng } object */
function toLatLngPair(coords) {
  if (!coords) return null;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }
  if (typeof coords === 'object' && coords.lat != null && coords.lng != null) {
    const lat = Number(coords.lat);
    const lng = Number(coords.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }
  return null;
}

function collectBoundsPoints(...groups) {
  const out = [];
  for (const group of groups) {
    if (!group) continue;
    const items = Array.isArray(group) ? group : [group];
    for (const item of items) {
      const pair = toLatLngPair(item);
      if (pair) out.push(pair);
    }
  }
  return out;
}

export default function PublishRouteMap({
  fromCoords,
  toCoords,
  stopoverCoords = [],
  polyline,
  alternativePolylines = [],
  fromLabel,
  toLabel,
  stopoverLabels = [],
  matchingRadiusKm = 50,
  showCoverage = true,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const from = toLatLngPair(fromCoords);
    const to = toLatLngPair(toCoords);
    if (!from || !to) return undefined;

    const map = L.map(containerRef.current, {
      center: from,
      zoom: 10,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(DARK_TILES, { maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [fromCoords, toCoords]);

  useEffect(() => {
    const map = mapRef.current;
    const from = toLatLngPair(fromCoords);
    const to = toLatLngPair(toCoords);
    if (!map || !from || !to) return;

    if (layerRef.current) {
      layerRef.current.clearLayers();
    } else {
      layerRef.current = L.layerGroup().addTo(map);
    }

    const group = layerRef.current;
    const radiusM = matchingRadiusKm * 1000;

    const normalizedStops = stopoverCoords.map(toLatLngPair).filter(Boolean);
    const coveragePoints = [from, ...normalizedStops, to];

    if (showCoverage) {
      for (const coords of coveragePoints) {
        L.circle(coords, {
          radius: radiusM,
          color: '#38bdf8',
          fillColor: '#38bdf8',
          fillOpacity: 0.06,
          weight: 1,
          dashArray: '4 6',
        }).addTo(group);
      }
    }

    for (const alt of alternativePolylines) {
      if (alt?.length >= 2) {
        L.polyline(alt, { color: '#64748b', weight: 3, opacity: 0.45, dashArray: '6 8' }).addTo(group);
      }
    }

    const routeLine = polyline?.length >= 2 ? polyline : [from, to];
    L.polyline(routeLine, { color: '#22c55e', weight: 5, opacity: 0.95 }).addTo(group);

    const pin = (coords, label, cls) => L.divIcon({
      className: `publish-map-pin ${cls}`,
      html: `<span>${label?.slice(0, 14) || ''}</span>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });

    L.marker(from, { icon: pin(from, fromLabel, 'from') }).addTo(group);
    normalizedStops.forEach((coords, i) => {
      L.marker(coords, { icon: pin(coords, stopoverLabels[i] || `Stop ${i + 1}`, 'stop') }).addTo(group);
    });
    L.marker(to, { icon: pin(to, toLabel, 'to') }).addTo(group);

    const allPoints = collectBoundsPoints(
      from,
      ...normalizedStops,
      to,
      routeLine,
      ...alternativePolylines,
    );

    if (showCoverage && coveragePoints.length) {
      const latPad = metersToLatDegrees(radiusM);
      for (const [lat, lng] of coveragePoints) {
        allPoints.push([lat + latPad, lng], [lat - latPad, lng]);
      }
    }

    if (allPoints.length >= 2) {
      try {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [48, 48] });
      } catch {
        map.setView(from, 10);
      }
    } else {
      map.setView(from, 10);
    }
  }, [
    fromCoords, toCoords, stopoverCoords, polyline, alternativePolylines,
    fromLabel, toLabel, stopoverLabels, matchingRadiusKm, showCoverage,
  ]);

  return <div ref={containerRef} className="publish-route-map" aria-hidden="true" />;
}
