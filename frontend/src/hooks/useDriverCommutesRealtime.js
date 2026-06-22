import { useEffect } from 'react';
import { onCommuteListingChange, onNewRidePublished } from '../services/realtime';

/**
 * Refresh driver's own commute list when they publish, update, or cancel.
 */
export function useDriverCommutesRealtime({ userId, onChange, enabled = true }) {
  useEffect(() => {
    if (!enabled || !userId) return undefined;

    const isOwn = (commute) => Number(commute?.driver_id) === Number(userId);

    const handleUpsert = (commute, eventType = 'UPDATE') => {
      if (!isOwn(commute)) return;
      onChange?.(commute, eventType);
    };

    const unsubInsert = onNewRidePublished((commute) => {
      handleUpsert(commute, 'INSERT');
    });

    const unsubChange = onCommuteListingChange((commute, eventType) => {
      if (!isOwn(commute)) return;
      onChange?.(commute, eventType);
    });

    return () => {
      unsubInsert();
      unsubChange();
    };
  }, [userId, onChange, enabled]);
}
