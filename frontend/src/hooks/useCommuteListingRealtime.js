import { useRideRealtime } from './useRideRealtime';
import { useGeospatialRidesRealtime } from './useGeospatialRidesRealtime';

/**
 * Keeps browse listings in sync with realtime create/update/cancel events.
 */
export function useCommuteListingRealtime({
  userId,
  routeFrom,
  routeTo,
  date,
  city,
  geospatialMode,
  onCommuteUpsert,
  onCommuteRemove,
  searchRef,
  enabled = true,
}) {
  useRideRealtime({
    userId,
    routeFrom,
    routeTo,
    date,
    city,
    onRide: onCommuteUpsert,
    onRemove: onCommuteRemove,
    enabled: enabled && Boolean(userId),
  });

  useGeospatialRidesRealtime({
    enabled: enabled && Boolean(userId) && geospatialMode,
    onEvent: () => {
      if (searchRef?.current) searchRef.current();
    },
    onTripRemove: onCommuteRemove,
  });
}
