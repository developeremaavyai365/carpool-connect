import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, publishNearbyResult, requestNearbyLocations } from '../services/realtime';
import { isSupabaseConfigured } from '../lib/supabase';
import { locationApi } from '../services/api';
import { distanceKm } from '../utils/geo';

const EMIT_INTERVAL_MS = 12000;
const MIN_MOVE_KM = 0.04;

function mapGeoError(code) {
  switch (code) {
    case 1:
      return 'Location permission denied. Enable location access in your browser settings.';
    case 2:
      return 'Location unavailable. Check GPS or network and try again.';
    case 3:
      return 'Location request timed out. Try again outdoors or with better signal.';
    default:
      return 'Could not detect your location.';
  }
}

export function useLiveLocation(user, { enabled = true } = {}) {
  const [position, setPosition] = useState(null);
  const [address, setAddress] = useState(null);
  const [permission, setPermission] = useState('prompt');
  const [error, setError] = useState(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef(null);
  const lastEmitRef = useRef({ at: 0, lat: null, lng: null });
  const reversePendingRef = useRef(false);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  const emitLocation = useCallback(async (coords) => {
    if (!user) return;

    const { latitude: lat, longitude: lng, accuracy } = coords;
    const now = Date.now();
    const last = lastEmitRef.current;

    if (
      last.lat != null
      && now - last.at < EMIT_INTERVAL_MS
      && distanceKm(last.lat, last.lng, lat, lng) < MIN_MOVE_KM
    ) {
      return;
    }

    lastEmitRef.current = { at: now, lat, lng };

    if (isSupabaseConfigured()) {
      try {
        const result = await locationApi.update({
          lat,
          lng,
          accuracy,
          city: user.city,
          route_from: user.route_from,
          name: user.name,
        });
        publishNearbyResult({
          colleagues: result.colleagues,
          nearbyCount: result.nearbyCount,
          city: result.city,
        });
      } catch {
        /* keep tracking */
      }
    } else {
      const socket = getSocket();
      if (!socket?.connected) return;

      socket.emit('location:update', {
        lat,
        lng,
        accuracy,
        city: user.city,
        route_from: user.route_from,
        name: user.name,
      });

      requestNearbyLocations();
    }

    if (!reversePendingRef.current) {
      reversePendingRef.current = true;
      try {
        const { location } = await locationApi.reverse(lat, lng);
        setAddress(location);
      } catch {
        /* keep last address */
      } finally {
        reversePendingRef.current = false;
      }
    }
  }, [user]);

  const handlePosition = useCallback((pos) => {
    setError(null);
    setPermission('granted');
    setPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      updatedAt: pos.timestamp,
    });
    emitLocation(pos.coords);
  }, [emitLocation]);

  const startTracking = useCallback(() => {
    if (!enabled || !user || !navigator.geolocation) {
      setError('Geolocation is not supported on this device or browser.');
      return;
    }

    setError(null);

    if (watchIdRef.current != null) {
      setTracking(true);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => {
        setPermission(err.code === 1 ? 'denied' : 'prompt');
        setError(mapGeoError(err.code));
        if (err.code !== 1) {
          setTimeout(() => {
            if (watchIdRef.current != null) {
              navigator.geolocation.clearWatch(watchIdRef.current);
              watchIdRef.current = null;
              startTracking();
            }
          }, 5000);
        }
      },
      options
    );

    setTracking(true);
  }, [enabled, user, handlePosition]);

  useEffect(() => {
    if (!enabled || !user) {
      stopTracking();
      return undefined;
    }

    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermission(result.state);
        result.onchange = () => setPermission(result.state);
      }).catch(() => {});
    }

    return () => stopTracking();
  }, [enabled, user, stopTracking]);

  return {
    position,
    address,
    permission,
    error,
    tracking,
    startTracking,
    stopTracking,
  };
}
