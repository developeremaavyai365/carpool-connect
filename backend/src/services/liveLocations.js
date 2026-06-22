const db = require('../database');
const { isSupabaseConfigured } = require('../lib/supabase');
const { distanceKm } = require('../utils/geoMath');

const STALE_MS = 5 * 60 * 1000;
const store = new Map();
const useDb = isSupabaseConfigured();

function setMemoryLocation(userId, data) {
  store.set(String(userId), {
    userId: String(userId),
    lat: data.lat,
    lng: data.lng,
    accuracy: data.accuracy ?? null,
    city: data.city || null,
    route_from: data.route_from || null,
    name: data.name || null,
    updatedAt: Date.now(),
  });
}

async function setLocation(userId, data) {
  if (useDb) {
    await db.upsertLiveLocation(userId, data);
    return;
  }
  setMemoryLocation(userId, data);
}

async function removeLocation(userId) {
  if (useDb) {
    await db.removeLiveLocation(userId);
    return;
  }
  store.delete(String(userId));
}

async function getLocation(userId) {
  if (useDb) {
    const list = await db.listLiveLocations({ excludeUserId: null, maxAgeMs: STALE_MS });
    return list.find((e) => String(e.userId) === String(userId)) || null;
  }
  return store.get(String(userId)) || null;
}

function isFresh(entry) {
  return entry && Date.now() - entry.updatedAt < STALE_MS;
}

function filterMemoryActive({ city, excludeUserId } = {}) {
  const now = Date.now();
  return [...store.values()].filter((entry) => {
    if (now - entry.updatedAt >= STALE_MS) return false;
    if (excludeUserId && entry.userId === String(excludeUserId)) return false;
    if (city && entry.city && entry.city !== city) return false;
    return entry.lat != null && entry.lng != null;
  });
}

async function listActive({ city, excludeUserId } = {}) {
  if (useDb) {
    return db.listLiveLocations({ city, excludeUserId, maxAgeMs: STALE_MS });
  }
  return filterMemoryActive({ city, excludeUserId });
}

async function countNearby({ lat, lng, city, radiusKm = 15, excludeUserId }) {
  const active = await listActive({ city, excludeUserId });
  return active.filter((entry) => {
    if (lat == null || lng == null) return true;
    return distanceKm(lat, lng, entry.lat, entry.lng) <= radiusKm;
  }).length;
}

module.exports = {
  setLocation,
  removeLocation,
  getLocation,
  listActive,
  countNearby,
  STALE_MS,
  isSupabaseBacked: useDb,
};
