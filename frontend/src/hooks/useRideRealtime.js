import { useEffect, useRef } from 'react';
import { onNewRidePublished, onCommuteListingChange } from '../services/realtime';
import { commuteMatchesBrowseFilters } from '../utils/commuteFilters';

/**
 * Subscribe to live ride publishing events and merge matching rides into list state.
 */
export function useRideRealtime({
  userId,
  routeFrom,
  routeTo,
  date,
  city,
  onRide,
  onRemove,
  enabled = true,
}) {
  const filtersRef = useRef({ userId, routeFrom, routeTo, date, city });
  filtersRef.current = { userId, routeFrom, routeTo, date, city };

  useEffect(() => {
    if (!enabled || !userId) return undefined;

    const unsubNew = onNewRidePublished((commute) => {
      const f = filtersRef.current;
      if (!commuteMatchesBrowseFilters(commute, f)) return;
      onRide?.(commute);
    });

    const unsubChange = onCommuteListingChange((commute, eventType) => {
      const f = filtersRef.current;
      if (eventType === 'DELETE' || commute?.status === 'cancelled' || commute?.status === 'expired') {
        onRemove?.(commute?.id);
        return;
      }
      if (commuteMatchesBrowseFilters(commute, f)) {
        onRide?.(commute);
      } else {
        onRemove?.(commute?.id);
      }
    });

    return () => {
      unsubNew();
      unsubChange();
    };
  }, [enabled, userId, onRide, onRemove]);
}
