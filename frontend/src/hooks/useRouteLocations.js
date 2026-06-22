import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from '../context/LocationContext';
import { locationLabelForFrom, locationLabelForDrop, cityFromLocation } from '../utils/locationLabel';

export const SOURCE = {
  EMPTY: 'empty',
  PROFILE: 'profile',
  LIVE: 'live',
  MAP: 'map',
  MANUAL: 'manual',
};

function mapGeoError(code) {
  switch (code) {
    case 1:
      return 'Location permission denied. Use Add from Map or type manually.';
    case 2:
      return 'Location unavailable. Use Add from Map or type manually.';
    case 3:
      return 'Location timed out. Use Add from Map or type manually.';
    default:
      return 'Could not detect location. Use Add from Map or type manually.';
  }
}

/**
 * Pickup: auto map/GPS fill + map picker + manual.
 * Drop Location: map picker + manual (never live GPS auto).
 */
export function useRouteLocations({ autoDetectFrom = false } = {}) {
  const { address, fetchCurrentAddress, startTracking, permission } = useLocation();

  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [city, setCity] = useState('');
  const [fromSource, setFromSource] = useState(SOURCE.EMPTY);
  const [toSource, setToSource] = useState(SOURCE.EMPTY);
  const [fromLoading, setFromLoading] = useState(false);
  const [fromError, setFromError] = useState('');
  const autoFromAttempted = useRef(false);

  const applyCityFromLocation = useCallback((location) => {
    const detectedCity = cityFromLocation(location);
    if (detectedCity) {
      setCity((prev) => prev || detectedCity);
    }
  }, []);

  const applyMapLocation = useCallback((segment, location) => {
    const isFrom = segment === 'from';
    const label = isFrom
      ? locationLabelForFrom(location)
      : locationLabelForDrop(location);

    if (!label) {
      throw new Error('Could not resolve this place on the map. Try another spot.');
    }

    if (segment === 'from') {
      setRouteFrom(label);
      setFromSource(SOURCE.MAP);
      setFromError('');
    } else {
      setRouteTo(label);
      setToSource(SOURCE.MAP);
    }
    applyCityFromLocation(location);
    return label;
  }, [applyCityFromLocation]);

  const fillFromLive = useCallback(async () => {
    setFromLoading(true);
    setFromError('');

    try {
      if (permission === 'denied') {
        throw Object.assign(new Error(mapGeoError(1)), { code: 1 });
      }

      startTracking();
      const location = await fetchCurrentAddress({ fresh: true });
      const label = locationLabelForFrom(location);
      if (!label) {
        throw new Error('Could not resolve a place on the map. Tap Add from Map.');
      }

      setRouteFrom(label);
      setFromSource(SOURCE.LIVE);
      applyCityFromLocation(location);
      return { label, location };
    } catch (err) {
      const message = err.code != null ? mapGeoError(err.code) : (err.message || mapGeoError());
      setFromError(message);
      throw err;
    } finally {
      setFromLoading(false);
    }
  }, [applyCityFromLocation, fetchCurrentAddress, permission, startTracking]);

  const setFromManual = useCallback((value) => {
    setRouteFrom(value);
    setFromSource(value ? SOURCE.MANUAL : SOURCE.EMPTY);
    setFromError('');
  }, []);

  const setToManual = useCallback((value) => {
    setRouteTo(value);
    setToSource(value ? SOURCE.MANUAL : SOURCE.EMPTY);
  }, []);

  const syncFromInitial = useCallback((next) => {
    setRouteFrom(next.route_from || '');
    setRouteTo(next.route_to || '');
    setCity(next.city || '');
    setFromSource(next.route_from ? SOURCE.PROFILE : SOURCE.EMPTY);
    setToSource(next.route_to ? SOURCE.PROFILE : SOURCE.EMPTY);
    setFromError('');
    autoFromAttempted.current = false;
  }, []);

  useEffect(() => {
    if (!autoDetectFrom || !address || routeFrom || fromSource !== SOURCE.EMPTY) return;

    const label = locationLabelForFrom(address);
    if (!label) return;

    setRouteFrom(label);
    setFromSource(SOURCE.LIVE);
    applyCityFromLocation(address);
  }, [autoDetectFrom, address, routeFrom, fromSource, applyCityFromLocation]);

  useEffect(() => {
    if (!autoDetectFrom || autoFromAttempted.current || routeFrom || permission === 'denied') return;
    autoFromAttempted.current = true;
    fillFromLive().catch(() => {});
  }, [autoDetectFrom, routeFrom, permission, fillFromLive]);

  return {
    routeFrom,
    routeTo,
    city,
    setCity,
    fromLoading,
    fromError,
    fromMapFilled: fromSource === SOURCE.MAP || fromSource === SOURCE.LIVE,
    fromAutoMapFilled: fromSource === SOURCE.LIVE,
    fromPickerMapFilled: fromSource === SOURCE.MAP,
    dropMapFilled: toSource === SOURCE.MAP,
    fromProfileFilled: fromSource === SOURCE.PROFILE,
    dropProfileFilled: toSource === SOURCE.PROFILE,
    setFromManual,
    setToManual,
    applyMapLocation,
    syncFromInitial,
    SOURCE,
  };
};
