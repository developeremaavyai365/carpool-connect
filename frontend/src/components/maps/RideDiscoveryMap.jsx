import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, Marker, Polyline, GoogleMarkerClusterer } from '@react-google-maps/api';
import { useTheme } from '../../context/ThemeContext';
import { useGoogleMaps } from '../../context/GoogleMapsProvider';
import {
  DEFAULT_MAP_CENTER, INDIA_BOUNDS, mapStylesForTheme, toLatLng, commuteRoutePath,
} from '../../utils/googleMapStyles';
import { tripToCommuteCard } from '../../utils/geospatialTripMapper';
import RideDiscoveryMapLeaflet from './RideDiscoveryMapLeaflet';
import './RideDiscoveryMap.css';

const MAP_OPTIONS = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  restriction: { latLngBounds: INDIA_BOUNDS, strictBounds: false },
};

function commuteMarkerPosition(commute) {
  return toLatLng([
    commute.pickup_lat ?? commute.source_lat,
    commute.pickup_lng ?? commute.source_lng,
  ]) || toLatLng(commute.from) || null;
}

function GoogleDiscoveryMap({
  commutes,
  selectedId,
  onSelectCommute,
  userPosition,
  className,
}) {
  const { theme } = useTheme();
  const mapRef = useRef(null);

  const markers = useMemo(() => (
    commutes.map((c) => {
      const card = c.geospatial ? c : tripToCommuteCard(c) || c;
      const pos = commuteMarkerPosition(card);
      if (!pos) return null;
      return { commute: card, position: pos };
    }).filter(Boolean)
  ), [commutes]);

  const selected = markers.find((m) => String(m.commute.id) === String(selectedId));
  const selectedRoute = useMemo(
    () => (selected ? commuteRoutePath(selected.commute) : []),
    [selected],
  );

  const mapOptions = useMemo(() => ({
    ...MAP_OPTIONS,
    styles: mapStylesForTheme(theme),
  }), [theme]);

  const handleMarkerClick = useCallback((commute) => {
    onSelectCommute?.(commute);
  }, [onSelectCommute]);

  const fitAllMarkers = useCallback((map) => {
    if (!map || markers.length < 1) return;
    if (markers.length === 1) {
      map.setCenter(markers[0].position);
      map.setZoom(12);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend(m.position));
    map.fitBounds(bounds, 48);
  }, [markers]);

  const focusSelected = useCallback((map) => {
    if (!map || !selected) return;
    const route = commuteRoutePath(selected.commute);
    if (route.length >= 2) {
      const bounds = new window.google.maps.LatLngBounds();
      route.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 64);
      return;
    }
    map.panTo(selected.position);
    map.setZoom(13);
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selected) focusSelected(map);
    else fitAllMarkers(map);
  }, [selected, focusSelected, fitAllMarkers]);

  return (
    <div className={`ride-discovery-map ${className}`}>
      <GoogleMap
        mapContainerClassName="ride-discovery-map-canvas"
        center={DEFAULT_MAP_CENTER}
        zoom={11}
        options={mapOptions}
        onLoad={(map) => {
          mapRef.current = map;
          if (selected) focusSelected(map);
          else fitAllMarkers(map);
        }}
      >
        {userPosition?.lat != null && (
          <Marker
            position={{ lat: userPosition.lat, lng: userPosition.lng }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
            }}
            title="Your location"
          />
        )}

        <GoogleMarkerClusterer>
          {(clusterer) => markers.map(({ commute, position }) => (
            <Marker
              key={commute.id}
              clusterer={clusterer}
              position={position}
              onClick={() => handleMarkerClick(commute)}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: String(commute.id) === String(selectedId) ? 12 : 9,
                fillColor: String(commute.id) === String(selectedId) ? '#22c55e' : '#38bdf8',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
              }}
              title={`${commute.route_from} → ${commute.route_to}`}
            />
          ))}
        </GoogleMarkerClusterer>

        {selectedRoute.length >= 2 && (
          <Polyline
            path={selectedRoute}
            options={{ strokeColor: '#22c55e', strokeWeight: 4, strokeOpacity: 0.9 }}
          />
        )}
      </GoogleMap>
    </div>
  );
}

export default function RideDiscoveryMap(props) {
  const { ready } = useGoogleMaps();

  if (!ready) {
    return <RideDiscoveryMapLeaflet {...props} />;
  }

  return <GoogleDiscoveryMap {...props} />;
}
