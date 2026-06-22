import { useMemo } from 'react';
import { GoogleMap, Marker, Polyline, Circle } from '@react-google-maps/api';
import { useTheme } from '../../context/ThemeContext';
import { useGoogleMaps } from '../../context/GoogleMapsProvider';
import {
  DEFAULT_MAP_CENTER, INDIA_BOUNDS, mapStylesForTheme, pathFromPolyline, toLatLng,
} from '../../utils/googleMapStyles';
import PublishRouteMap from '../PublishRouteMap';
import './RouteVisualizationMap.css';

const MAP_OPTIONS_BASE = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  restriction: { latLngBounds: INDIA_BOUNDS, strictBounds: false },
};

function GoogleRouteMap({
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
  className = '',
}) {
  const { theme } = useTheme();
  const from = toLatLng(fromCoords);
  const to = toLatLng(toCoords);
  const stops = (stopoverCoords || []).map(toLatLng).filter(Boolean);
  const routePath = pathFromPolyline(polyline);
  const mainPath = routePath.length >= 2 ? routePath : (from && to ? [from, to] : []);

  const bounds = useMemo(() => {
    if (!window.google?.maps) return null;
    const points = [from, ...stops, to, ...mainPath].filter(Boolean);
    if (points.length < 2) return null;
    const b = new window.google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    if (showCoverage && matchingRadiusKm) {
      const pad = matchingRadiusKm / 111;
      points.forEach((p) => {
        b.extend({ lat: p.lat + pad, lng: p.lng });
        b.extend({ lat: p.lat - pad, lng: p.lng });
      });
    }
    return b;
  }, [from, to, stops, mainPath, showCoverage, matchingRadiusKm]);

  const mapOptions = useMemo(() => ({
    ...MAP_OPTIONS_BASE,
    styles: mapStylesForTheme(theme),
  }), [theme]);

  if (!from || !to) {
    return <div className={`route-viz-map route-viz-map-empty ${className}`}>Route map loading…</div>;
  }

  return (
    <div className={`route-viz-map ${className}`}>
      <GoogleMap
        mapContainerClassName="route-viz-map-canvas"
        center={DEFAULT_MAP_CENTER}
        zoom={10}
        options={mapOptions}
        onLoad={(map) => {
          if (bounds) map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
          else if (from) map.panTo(from);
        }}
      >
        {showCoverage && [from, ...stops, to].filter(Boolean).map((pt, i) => (
          <Circle
            key={`cov-${i}`}
            center={pt}
            radius={matchingRadiusKm * 1000}
            options={{
              strokeColor: '#38bdf8',
              strokeOpacity: 0.35,
              strokeWeight: 1,
              fillColor: '#38bdf8',
              fillOpacity: 0.06,
            }}
          />
        ))}

        {alternativePolylines.filter((p) => p?.length >= 2).map((alt, i) => (
          <Polyline
            key={`alt-${i}`}
            path={pathFromPolyline(alt)}
            options={{ strokeColor: '#64748b', strokeOpacity: 0.45, strokeWeight: 3 }}
          />
        ))}

        {mainPath.length >= 2 && (
          <Polyline
            path={mainPath}
            options={{ strokeColor: '#22c55e', strokeOpacity: 0.95, strokeWeight: 5 }}
          />
        )}

        <Marker position={from} label={{ text: 'A', color: '#fff', fontWeight: '700' }} title={fromLabel} />
        {stops.map((pt, i) => (
          <Marker
            key={`stop-${i}`}
            position={pt}
            label={{ text: String(i + 1), color: '#fff', fontWeight: '700' }}
            title={stopoverLabels[i] || `Stop ${i + 1}`}
          />
        ))}
        <Marker position={to} label={{ text: 'B', color: '#fff', fontWeight: '700' }} title={toLabel} />
      </GoogleMap>
    </div>
  );
}

/** Route map — Google Maps when available, Leaflet fallback */
export default function RouteVisualizationMap(props) {
  const { ready } = useGoogleMaps();

  if (ready) {
    return <GoogleRouteMap {...props} />;
  }

  return <PublishRouteMap {...props} />;
}
