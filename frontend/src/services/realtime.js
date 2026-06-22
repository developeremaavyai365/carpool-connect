import { isSupabaseConfigured, getSupabase, setRealtimeAuth, resetSupabaseClient } from '../lib/supabase';
import { commuteApi } from './api';

let socket = null;
let socketPromise = null;
let notificationHandler = null;
let requestChangeHandler = null;
const locationHandlers = new Set();
const nearbyHandlers = new Set();
const notificationListeners = new Set();
const rideListeners = new Set();
const commuteChangeListeners = new Set();
const geospatialRideListeners = new Set();
const recentRideIds = new Map();
const RIDE_DEDUPE_MS = 15000;

const RIDES_BROADCAST_CHANNEL = 'rides-public';

function getSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  return `${window.location.protocol}//${window.location.host}`;
}

async function loadSocketIo() {
  if (socketPromise) return socketPromise;
  socketPromise = import('socket.io-client').then((mod) => mod.io);
  return socketPromise;
}

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    employee_id: row.employee_id,
    type: row.type,
    title: row.title,
    message: row.message,
    related_request_id: row.related_request_id,
    is_read: row.is_read ? 1 : 0,
    created_at: row.created_at,
  };
}

function mapLiveLocation(row) {
  return {
    userId: row.user_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    route_from: row.route_from,
    city: row.city,
    accuracy: row.accuracy,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function mapCommuteRow(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    driver_id: row.driver_id,
    driver_name: row.driver_name || 'Driver',
    driver_city: row.driver_city || row.city || '',
    route_from: row.route_from,
    route_to: row.route_to,
    city: row.city || '',
    departure_at: row.departure_at,
    seats_available: row.seats_available,
    price_per_seat: row.price_per_seat ?? 0,
    notes: row.notes || '',
    stopovers: row.stopovers || [],
    route_label: row.route_label || '',
    route_detail: row.route_detail || '',
    smoking: row.smoking,
    music: row.music,
    pets: row.pets,
    status: row.status || 'active',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isLiveListingStatus(status) {
  const s = (status || 'active').toLowerCase();
  return s === 'active' || s === 'upcoming';
}

function shouldDispatchRide(commute) {
  if (!commute?.id || !isLiveListingStatus(commute.status)) return false;
  const now = Date.now();
  const last = recentRideIds.get(commute.id);
  if (last && now - last < RIDE_DEDUPE_MS) return false;
  recentRideIds.set(commute.id, now);
  for (const [id, ts] of recentRideIds) {
    if (now - ts > RIDE_DEDUPE_MS) recentRideIds.delete(id);
  }
  return true;
}

function mapTripRow(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    driver_id: row.driver_id,
    driver_name: row.driver_name || 'Driver',
    route_from: row.source_label,
    route_to: row.dest_label,
    city: row.city || '',
    departure_at: row.departure_at,
    seats_available: row.seats_available,
    price_per_seat: row.price_per_seat ?? 0,
    status: row.status || 'active',
    match_score: row.match_score,
    detour_km: row.detour_km,
    route_distance_m: row.route_distance_m,
    route_duration_s: row.route_duration_s,
    geospatial: true,
  };
}

function dispatchGeospatialTripEvent(event, payload) {
  geospatialRideListeners.forEach((listener) => listener({ event, ...payload }));
}

export function onGeospatialTripEvent(callback) {
  geospatialRideListeners.add(callback);
  return () => geospatialRideListeners.delete(callback);
}

function dispatchNewRide(commute) {
  const mapped = mapCommuteRow(commute);
  if (!mapped || !shouldDispatchRide(mapped)) return;
  rideListeners.forEach((listener) => listener(mapped));
}

async function enrichRideFromDb(row) {
  if (row.driver_name) return mapCommuteRow(row);
  try {
    const { commute } = await commuteApi.getById(row.id);
    return commute || mapCommuteRow(row);
  } catch {
    return mapCommuteRow(row);
  }
}

function dispatchNotification(notification) {
  notificationHandler?.(notification);
  notificationListeners.forEach((listener) => listener(notification));
}

export function onNotificationReceived(callback) {
  notificationListeners.add(callback);
  return () => notificationListeners.delete(callback);
}

export function onNewRidePublished(callback) {
  rideListeners.add(callback);
  return () => rideListeners.delete(callback);
}

function dispatchCommuteListingChange(commute, eventType) {
  commuteChangeListeners.forEach((listener) => listener(commute, eventType));
}

export function onCommuteListingChange(callback) {
  commuteChangeListeners.add(callback);
  return () => commuteChangeListeners.delete(callback);
}

let supabaseChannels = [];

function subscribeSupabase(userId) {
  const sb = getSupabase();
  if (!sb || !userId) return;

  const notifChannel = sb
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `employee_id=eq.${userId}`,
      },
      (payload) => {
        const notification = mapNotification(payload.new);
        if (notification) dispatchNotification(notification);
      },
    )
    .subscribe();

  const requestChannel = sb
    .channel(`requests-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'carpool_requests',
      },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        if (row.sender_id === userId || row.receiver_id === userId) {
          requestChangeHandler?.();
        }
      },
    )
    .subscribe();

  const locationChannel = sb
    .channel('live-locations')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'live_locations',
      },
      (payload) => {
        if (payload.eventType === 'DELETE' && payload.old) {
          locationHandlers.forEach((handler) => handler({
            type: 'remove',
            userId: payload.old.user_id,
          }));
          return;
        }
        if (payload.new) {
          locationHandlers.forEach((handler) => handler(mapLiveLocation(payload.new)));
        }
      },
    )
    .subscribe();

  const ridesBroadcastChannel = sb
    .channel(RIDES_BROADCAST_CHANNEL)
    .on('broadcast', { event: 'new_ride' }, ({ payload }) => {
      if (payload) dispatchNewRide(payload);
    })
    .on('broadcast', { event: 'trip:created' }, ({ payload }) => {
      const trip = mapTripRow(payload?.trip);
      if (trip) {
        dispatchGeospatialTripEvent('trip:created', { trip, at: payload?.at });
        if (shouldDispatchRide(trip)) rideListeners.forEach((l) => l(trip));
      }
    })
    .on('broadcast', { event: 'trip:updated' }, ({ payload }) => {
      dispatchGeospatialTripEvent('trip:updated', { trip: mapTripRow(payload?.trip), at: payload?.at });
    })
    .on('broadcast', { event: 'trip:booked' }, ({ payload }) => {
      dispatchGeospatialTripEvent('trip:booked', {
        trip: mapTripRow(payload?.trip),
        booking: payload?.booking,
        at: payload?.at,
      });
    })
    .on('broadcast', { event: 'trip:cancelled' }, ({ payload }) => {
      dispatchGeospatialTripEvent('trip:cancelled', { trip: mapTripRow(payload?.trip), at: payload?.at });
    })
    .on('broadcast', { event: 'booking_cancelled' }, ({ payload }) => {
      dispatchGeospatialTripEvent('booking_cancelled', {
        trip: mapTripRow(payload?.trip),
        booking: payload?.booking,
        at: payload?.at,
      });
    })
    .on('broadcast', { event: 'seat_changed' }, ({ payload }) => {
      dispatchGeospatialTripEvent('seat_changed', {
        trip: mapTripRow(payload?.trip),
        booking: payload?.booking,
        at: payload?.at,
      });
    })
    .on('broadcast', { event: 'seat_updates' }, ({ payload }) => {
      dispatchGeospatialTripEvent('seat_changed', {
        trip: mapTripRow(payload?.trip),
        at: payload?.at,
      });
    })
    .subscribe();

  const tripsDbChannel = sb
    .channel(`trips-db-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trips' },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        const event = payload.eventType === 'INSERT' ? 'trip:created'
          : payload.eventType === 'UPDATE' ? 'trip:updated'
            : 'trip:cancelled';
        const trip = mapTripRow(row);
        if (trip) dispatchGeospatialTripEvent(event, { trip });
      },
    )
    .subscribe();

  const ridesDbChannel = sb
    .channel(`rides-db-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'published_commutes',
      },
      async (payload) => {
        if (!payload.new) return;
        const commute = await enrichRideFromDb(payload.new);
        if (commute) {
          dispatchNewRide(commute);
          dispatchCommuteListingChange(commute, 'INSERT');
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'published_commutes',
      },
      async (payload) => {
        if (!payload.new) return;
        const commute = await enrichRideFromDb(payload.new);
        if (commute) dispatchCommuteListingChange(commute, 'UPDATE');
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'published_commutes',
      },
      (payload) => {
        if (!payload.old?.id) return;
        dispatchCommuteListingChange(mapCommuteRow(payload.old), 'DELETE');
      },
    )
    .subscribe();

  supabaseChannels = [notifChannel, requestChannel, locationChannel, ridesBroadcastChannel, tripsDbChannel, ridesDbChannel];
}

function unsubscribeSupabase() {
  const sb = getSupabase();
  supabaseChannels.forEach((channel) => {
    sb?.removeChannel(channel);
  });
  supabaseChannels = [];
}

export function connectRealtime(token, userId, onNotification, onRequestChange) {
  disconnectRealtime();
  notificationHandler = onNotification;
  requestChangeHandler = onRequestChange;

  if (isSupabaseConfigured()) {
    setRealtimeAuth(token);
    subscribeSupabase(userId);
    return { mode: 'supabase' };
  }

  loadSocketIo().then((io) => {
    if (socket?.connected) return;

    socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('notification', (notification) => {
      dispatchNotification(notification);
    });

    socket.on('recommendations:update', () => {
      requestChangeHandler?.();
    });

    socket.on('ride:published', (commute) => {
      dispatchNewRide(commute);
    });
  });

  return { mode: 'socket' };
}

export function publishNearbyResult(result) {
  if (!result) return;
  nearbyHandlers.forEach((handler) => handler(result));
}

export function onLocationsUpdate(callback) {
  if (isSupabaseConfigured()) {
    locationHandlers.add(callback);
    return () => locationHandlers.delete(callback);
  }
  if (!socket) return () => {};
  socket.on('locations:update', callback);
  return () => socket.off('locations:update', callback);
}

export function onNearbyUpdate(callback) {
  nearbyHandlers.add(callback);
  return () => nearbyHandlers.delete(callback);
}

export function requestNearbyLocations() {
  socket?.emit('location:request-nearby');
}

export function getSocket() {
  return socket;
}

export function isRealtimeConnected() {
  if (isSupabaseConfigured()) return supabaseChannels.length > 0;
  return Boolean(socket?.connected);
}

export function disconnectRealtime() {
  unsubscribeSupabase();
  resetSupabaseClient();

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  notificationHandler = null;
  requestChangeHandler = null;
  locationHandlers.clear();
  nearbyHandlers.clear();
  socketPromise = null;
}

export const connectSocket = (token, onNotification) => connectRealtime(token, null, onNotification);
export const disconnectSocket = disconnectRealtime;
