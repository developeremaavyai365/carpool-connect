import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useLiveLocation } from '../hooks/useLiveLocation';
import {
  getSocket,
  onLocationsUpdate,
  onNearbyUpdate,
  requestNearbyLocations,
} from '../services/realtime';
import { isSupabaseConfigured } from '../lib/supabase';
import { locationApi } from '../services/api';

function geolocationOnce(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('Geolocation is not supported on this device.'), { code: 0 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const { user } = useAuth();
  const {
    position,
    address,
    permission,
    error,
    tracking,
    startTracking,
    stopTracking,
  } = useLiveLocation(user, { enabled: Boolean(user) });

  const [colleagues, setColleagues] = useState([]);
  const [nearbyCount, setNearbyCount] = useState(0);
  const fetchPendingRef = useRef(null);

  const fetchCurrentAddress = useCallback(async ({ fresh = false } = {}) => {
    if (fetchPendingRef.current) return fetchPendingRef.current;

    const task = (async () => {
      if (!fresh && (address?.route_from || address?.home_address)) {
        return address;
      }

      if (!fresh && position?.lat != null && position?.lng != null) {
        const { location } = await locationApi.reverse(position.lat, position.lng);
        return location;
      }

      const pos = await geolocationOnce({
        enableHighAccuracy: true,
        maximumAge: fresh ? 0 : 5000,
        timeout: 25000,
      });

      const { location } = await locationApi.reverse(
        pos.coords.latitude,
        pos.coords.longitude,
      );
      return location;
    })();

    fetchPendingRef.current = task;
    try {
      return await task;
    } finally {
      fetchPendingRef.current = null;
    }
  }, [address, position]);

  const refreshNearby = useCallback(async () => {
    if (!user || !position) return;
    try {
      const res = await locationApi.nearby({
        lat: position.lat,
        lng: position.lng,
        city: user.city,
      });
      setColleagues(res.colleagues || []);
      setNearbyCount(res.nearbyCount ?? 0);
    } catch {
      /* ignore */
    }
  }, [user, position]);

  useEffect(() => {
    if (user && permission !== 'denied' && !tracking) {
      startTracking();
    }
  }, [user, permission, tracking, startTracking]);

  useEffect(() => {
    if (!user) return undefined;

    const onNearby = ({ colleagues: list, nearbyCount: count }) => {
      setColleagues(list || []);
      setNearbyCount(count ?? 0);
    };

    const onColleagueMove = (update) => {
      if (update?.type === 'remove') {
        setColleagues((prev) => prev.filter((c) => c.userId !== update.userId));
        return;
      }
      setColleagues((prev) => {
        const idx = prev.findIndex((c) => c.userId === update.userId);
        if (idx === -1) return [...prev, update];
        const next = [...prev];
        next[idx] = { ...next[idx], ...update };
        return next;
      });
    };

    const offNearby = onNearbyUpdate(onNearby);
    const offMove = onLocationsUpdate(onColleagueMove);

    if (!isSupabaseConfigured()) {
      const socket = getSocket();
      if (socket) {
        socket.on('locations:nearby', onNearby);
        if (tracking && position) {
          requestNearbyLocations();
        }
        return () => {
          socket.off('locations:nearby', onNearby);
          offMove();
          offNearby();
        };
      }
    }

    return () => {
      offMove();
      offNearby();
    };
  }, [user, tracking, position]);

  useEffect(() => {
    if (tracking && position) refreshNearby();
  }, [tracking, position?.lat, position?.lng, refreshNearby]);

  return (
    <LocationContext.Provider
      value={{
        position,
        address,
        permission,
        error,
        tracking,
        startTracking,
        stopTracking,
        colleagues,
        nearbyCount,
        refreshNearby,
        fetchCurrentAddress,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
