const db = require('../database');
const { isSupabaseConfigured, getSupabaseAdmin } = require('../lib/supabase');

const RIDES_BROADCAST_CHANNEL = 'rides-public';
const BACKEND_LISTENER_CHANNEL = 'backend-rides-listener';

let broadcastChannel = null;
let dbListenerChannel = null;
let listenerStarted = false;

/**
 * Broadcast an enriched ride to all connected Supabase Realtime clients.
 */
async function broadcastNewRide(commute) {
  if (!commute || commute.status !== 'active') return false;

  if (!isSupabaseConfigured()) return false;

  try {
    const sb = getSupabaseAdmin();
    if (!broadcastChannel) {
      broadcastChannel = sb.channel(RIDES_BROADCAST_CHANNEL, {
        config: { broadcast: { ack: false, self: true } },
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Broadcast channel subscribe timeout')), 15000);
        broadcastChannel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timer);
            reject(err || new Error(`Broadcast channel ${status}`));
          }
        });
      });
      console.log('[RideRealtime] Broadcast channel ready:', RIDES_BROADCAST_CHANNEL);
    }

    await broadcastChannel.send({
      type: 'broadcast',
      event: 'new_ride',
      payload: commute,
    });
    return true;
  } catch (err) {
    console.warn('[RideRealtime] broadcast failed:', err.message);
    return false;
  }
}

/**
 * Listen for INSERT on published_commutes and rebroadcast enriched rides.
 */
function startRideInsertListener() {
  if (!isSupabaseConfigured() || listenerStarted) return;

  const sb = getSupabaseAdmin();
  dbListenerChannel = sb
    .channel(BACKEND_LISTENER_CHANNEL)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'published_commutes',
      },
      async (payload) => {
        try {
          const row = payload.new;
          if (!row?.id || row.status !== 'active') return;
          const commute = await db.findCommuteById(row.id);
          if (commute) {
            await broadcastNewRide(commute);
            console.log('[RideRealtime] New ride broadcast:', commute.id, commute.route_from, '→', commute.route_to);
          }
        } catch (err) {
          console.warn('[RideRealtime] insert handler error:', err.message);
        }
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        listenerStarted = true;
        console.log('[RideRealtime] Listening for INSERT on published_commutes');
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[RideRealtime] DB listener error:', err?.message || status);
      }
    });
}

function stopRideInsertListener() {
  const sb = isSupabaseConfigured() ? getSupabaseAdmin() : null;
  if (dbListenerChannel && sb) {
    sb.removeChannel(dbListenerChannel);
    dbListenerChannel = null;
  }
  if (broadcastChannel && sb) {
    sb.removeChannel(broadcastChannel);
    broadcastChannel = null;
  }
  listenerStarted = false;
}

/**
 * Called after API creates a ride — ensures immediate broadcast (Socket.io fallback for SQLite).
 */
async function publishRideCreated(commute, { app } = {}) {
  if (!commute) return;

  if (isSupabaseConfigured()) {
    await broadcastNewRide(commute);
    return;
  }

  const io = app?.get?.('io');
  if (io) {
    io.emit('ride:published', commute);
  }
}

module.exports = {
  broadcastNewRide,
  startRideInsertListener,
  stopRideInsertListener,
  publishRideCreated,
  RIDES_BROADCAST_CHANNEL,
};
