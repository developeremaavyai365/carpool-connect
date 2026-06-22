import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { locationApi } from '../services/api';
import { locationLabelForFrom, locationLabelForDrop } from '../utils/locationLabel';
import { useGoogleMaps } from '../context/GoogleMapsProvider';
import GoogleMapPicker from './maps/GoogleMapPicker';
import './MapPickerModal.css';

const DEFAULT_CENTER = [28.6139, 77.209];
const INDIA_BOUNDS = L.latLngBounds([6.5, 68.1], [35.7, 97.4]);

const pickIcon = (segment) => L.divIcon({
  className: `map-pick-marker map-pick-marker-${segment}`,
  html: `<span>${segment === 'from' ? 'A' : 'B'}</span>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

function MapCanvas({ center, segment, onPick, markerPos }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);

  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: center || DEFAULT_CENTER,
      zoom: 14,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 0.85,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e) => {
      onPickRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.setView(center, map.getZoom() || 14, { animate: true });
  }, [center?.[0], center?.[1]]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerPos) {
      const latlng = [markerPos.lat, markerPos.lng];
      if (!markerRef.current) {
        markerRef.current = L.marker(latlng, {
          icon: pickIcon(segment),
          draggable: true,
          zIndexOffset: 1000,
        }).addTo(map);
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current.getLatLng();
          onPickRef.current(pos.lat, pos.lng);
        });
      } else {
        markerRef.current.setLatLng(latlng);
        markerRef.current.setIcon(pickIcon(segment));
      }
    } else if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  }, [markerPos, segment]);

  return <div ref={containerRef} className="map-picker-canvas" aria-hidden="true" />;
}

export default function MapPickerModal({
  open,
  onClose,
  segment,
  initialCenter,
  onConfirm,
}) {
  const [markerPos, setMarkerPos] = useState(null);
  const [resolvedLabel, setResolvedLabel] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const reverseTimer = useRef(null);
  const reverseSeq = useRef(0);
  const didInitRef = useRef(false);

  const segmentLabel = segment === 'from' ? 'Pickup From' : 'Drop Location';
  const segmentKey = segment === 'from' ? 'from' : 'drop';
  const { ready: googleReady } = useGoogleMaps();

  const reverseAt = useCallback(async (lat, lng) => {
    const seq = ++reverseSeq.current;
    setResolving(true);
    setError('');
    try {
      const { location } = await locationApi.reverse(lat, lng);
      if (seq !== reverseSeq.current) return;

      const label = segmentKey === 'from'
        ? locationLabelForFrom(location)
        : locationLabelForDrop(location);
      setResolvedLabel(label);
      setResolvedLocation(location);
      if (!label) {
        setError('Could not read this spot. Tap another point on the map.');
      }
    } catch (err) {
      if (seq !== reverseSeq.current) return;
      setError(err.message || 'Map lookup failed. Check your connection and try again.');
    } finally {
      if (seq === reverseSeq.current) setResolving(false);
    }
  }, [segmentKey]);

  const handlePick = useCallback((lat, lng) => {
    setMarkerPos({ lat, lng });
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(() => reverseAt(lat, lng), 750);
  }, [reverseAt]);

  useEffect(() => {
    if (!open) {
      didInitRef.current = false;
      setMarkerPos(null);
      setResolvedLabel('');
      setResolvedLocation(null);
      setError('');
      setResolving(false);
      return;
    }

    if (!didInitRef.current && initialCenter?.lat != null && initialCenter?.lng != null) {
      didInitRef.current = true;
      handlePick(initialCenter.lat, initialCenter.lng);
    }
  }, [open, initialCenter, handlePick]);

  useEffect(() => () => {
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
  }, []);

  if (!open) return null;

  const handleConfirm = () => {
    if (!resolvedLabel || !resolvedLocation) return;
    onConfirm({ label: resolvedLabel, location: resolvedLocation, ...markerPos });
    onClose();
  };

  const mapCenter = markerPos
    ? [markerPos.lat, markerPos.lng]
    : initialCenter
      ? [initialCenter.lat, initialCenter.lng]
      : DEFAULT_CENTER;

  return (
    <div className="map-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="map-picker-title">
      <div className="map-picker-sheet">
        <header className="map-picker-header">
          <div>
            <p className="map-picker-eyebrow">Add from Map</p>
            <h2 id="map-picker-title">Set {segmentLabel}</h2>
            <p className="map-picker-hint">Tap anywhere on the map or drag the pin to choose an exact spot.</p>
          </div>
          <button type="button" className="map-picker-close" onClick={onClose} aria-label="Close map">
            ×
          </button>
        </header>

        <div className="map-picker-map-wrap">
          {googleReady ? (
            <GoogleMapPicker
              center={initialCenter}
              segment={segmentKey}
              markerPos={markerPos}
              onPick={handlePick}
              className="map-picker-canvas"
            />
          ) : (
            <MapCanvas
              center={mapCenter}
              segment={segmentKey}
              onPick={handlePick}
              markerPos={markerPos}
            />
          )}
          {resolving && (
            <div className="map-picker-resolving">
              <span className="route-live-btn-spinner" aria-hidden="true" />
              Resolving address…
            </div>
          )}
        </div>

        <div className="map-picker-preview">
          {resolvedLabel ? (
            <>
              <span className="map-picker-preview-label">Selected address</span>
              <p className="map-picker-preview-text">{resolvedLabel}</p>
            </>
          ) : (
            <p className="map-picker-preview-empty">
              {error || 'Tap the map to select a location'}
            </p>
          )}
        </div>

        {error && resolvedLabel && <p className="map-picker-error">{error}</p>}

        <div className="map-picker-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!resolvedLabel || resolving}
          >
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}
