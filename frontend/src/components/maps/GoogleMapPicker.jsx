import { useCallback, useMemo } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { useTheme } from '../../context/ThemeContext';
import { useGoogleMaps } from '../../context/GoogleMapsProvider';
import {
  DEFAULT_MAP_CENTER, INDIA_BOUNDS, mapStylesForTheme, toLatLng,
} from '../../utils/googleMapStyles';

const MAP_OPTIONS = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  restriction: { latLngBounds: INDIA_BOUNDS, strictBounds: false },
};

export default function GoogleMapPicker({
  center,
  segment = 'from',
  markerPos,
  onPick,
  className = '',
}) {
  const { theme } = useTheme();
  const { ready } = useGoogleMaps();
  const mapCenter = useMemo(() => {
    if (markerPos) return toLatLng(markerPos);
    if (center) return toLatLng(center);
    return DEFAULT_MAP_CENTER;
  }, [center, markerPos]);

  const mapOptions = useMemo(() => ({
    ...MAP_OPTIONS,
    styles: mapStylesForTheme(theme),
  }), [theme]);

  const handleClick = useCallback((e) => {
    if (!e.latLng) return;
    onPick?.(e.latLng.lat(), e.latLng.lng());
  }, [onPick]);

  if (!ready) return null;

  const marker = markerPos ? toLatLng(markerPos) : null;

  return (
    <GoogleMap
      mapContainerClassName={className || 'map-picker-canvas'}
      center={mapCenter}
      zoom={14}
      options={mapOptions}
      onClick={handleClick}
    >
      {marker && (
        <Marker
          position={marker}
          draggable
          onDragEnd={(e) => {
            if (e.latLng) onPick?.(e.latLng.lat(), e.latLng.lng());
          }}
          label={{ text: segment === 'from' ? 'A' : 'B', color: '#fff', fontWeight: '700' }}
        />
      )}
    </GoogleMap>
  );
}
