import { useEffect, useRef } from 'react';
import { onGeospatialTripEvent } from '../services/realtime';

/**
 * Refetch geospatial search results when trips are created, booked, or cancelled.
 */
export function useGeospatialRidesRealtime({ enabled = true, onEvent, onTripRemove }) {
  const handlerRef = useRef(onEvent);
  const removeRef = useRef(onTripRemove);
  handlerRef.current = onEvent;
  removeRef.current = onTripRemove;

  useEffect(() => {
    if (!enabled) return undefined;

    return onGeospatialTripEvent((payload) => {
      if (payload.event === 'trip:cancelled' && payload.trip?.id) {
        removeRef.current?.(payload.trip.id);
      }
      handlerRef.current?.(payload);
    });
  }, [enabled, onEvent, onTripRemove]);
}
