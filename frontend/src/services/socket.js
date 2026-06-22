import { io } from 'socket.io-client';

let socket = null;
let recommendationsHandler = null;

/** Same host as the page — Vite proxies /socket.io in dev, backend serves both in prod. */
function getSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  return `${window.location.protocol}//${window.location.host}`;
}

export function connectSocket(token, onNotification) {
  if (socket?.connected) return socket;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('notification', (notification) => {
    onNotification?.(notification);
  });

  socket.on('recommendations:update', () => {
    recommendationsHandler?.();
  });

  return socket;
}

export function onRecommendationsUpdate(callback) {
  recommendationsHandler = callback;
  return () => {
    if (recommendationsHandler === callback) recommendationsHandler = null;
  };
}

export function onLocationsUpdate(callback) {
  if (!socket) return () => {};
  socket.on('locations:update', callback);
  return () => socket.off('locations:update', callback);
}

export function requestNearbyLocations() {
  socket?.emit('location:request-nearby');
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  recommendationsHandler = null;
}

export function getSocket() {
  return socket;
}
