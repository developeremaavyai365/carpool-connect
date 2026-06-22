import { useCallback, useEffect, useRef, useState } from 'react';
import { commuteApi } from '../services/api';

const DEBOUNCE_MS = 450;

/**
 * Debounced real-time route calculation whenever origin, destination, or stopovers change.
 */
export function useRouteCalculator({
  routeFrom,
  routeTo,
  stopovers = [],
  city,
  departureAt,
  enabled = true,
}) {
  const [routes, setRoutes] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [source, setSource] = useState('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const timerRef = useRef(null);
  const requestIdRef = useRef(0);

  const retry = useCallback(() => {
    setError('');
    setRetryToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const from = routeFrom?.trim();
    const to = routeTo?.trim();
    if (!from || !to) {
      setRoutes([]);
      setWaypoints([]);
      setSource('none');
      setError('');
      setLoading(false);
      return undefined;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError('');

      try {
        const res = await commuteApi.calculateRoutes({
          route_from: from,
          route_to: to,
          stopovers,
          city,
          departure_at: departureAt,
        });

        if (requestId !== requestIdRef.current) return;

        if (!res.routes?.length) {
          setRoutes([]);
          setWaypoints([]);
          setError(res.error || 'Unable to calculate route.');
          setSource(res.source || 'none');
          return;
        }

        setRoutes(res.routes);
        setWaypoints(res.waypoints || []);
        setSource(res.source || 'ors');
        setError('');
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setRoutes([]);
        setWaypoints([]);
        setError(err.data?.error || err.message || 'Routing service unavailable.');
        setSource('none');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [routeFrom, routeTo, stopovers, city, departureAt, enabled, retryToken]);

  return {
    routes,
    waypoints,
    source,
    loading,
    error,
    retry,
  };
}
