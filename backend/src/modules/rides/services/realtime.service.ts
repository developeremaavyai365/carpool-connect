/**
 * Supabase Realtime broadcast for trip lifecycle events.
 * Channel: rides-public (shared with Carpool Connect commute realtime)
 */
type TripEvent =
  | 'trip:created'
  | 'trip:updated'
  | 'trip:booked'
  | 'trip:cancelled'
  | 'booking_cancelled'
  | 'seat_changed';

const EVENT_ALIASES: Record<TripEvent, string[]> = {
  'trip:created': ['ride_created', 'trip:created'],
  'trip:updated': ['ride_updated', 'trip:updated'],
  'trip:booked': ['booking_created', 'trip:booked'],
  'trip:cancelled': ['ride_cancelled', 'trip:cancelled'],
  'booking_cancelled': ['booking_cancelled'],
  'seat_changed': ['seat_updates', 'seat_changed'],
};

export class RidesRealtimeService {
  private channel: Awaited<ReturnType<ReturnType<typeof import('@supabase/supabase-js').createClient>['channel']>> | null = null;

  private async getChannel() {
    if (this.channel) return this.channel;

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return null;

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ch = sb.channel('rides-public', {
      config: { broadcast: { ack: false, self: true } },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Realtime channel timeout')), 15000);
      ch.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
          clearTimeout(timer);
          reject(err || new Error('Channel error'));
        }
      });
    });

    this.channel = ch;
    return ch;
  }

  async broadcast(
    event: TripEvent,
    payload: { trip?: unknown; booking?: unknown },
  ): Promise<void> {
    try {
      const ch = await this.getChannel();
      if (!ch) return;
      const body = { ...payload, at: new Date().toISOString() };
      const names = EVENT_ALIASES[event] || [event];
      await Promise.all(names.map((name) => ch.send({
        type: 'broadcast',
        event: name,
        payload: body,
      })));
    } catch (err) {
      console.warn('[RidesRealtime]', event, (err as Error).message);
    }
  }

  /** @deprecated use broadcast() */
  async broadcastTripEvent(
    event: 'trip:created' | 'trip:updated' | 'trip:booked' | 'trip:cancelled',
    trip: unknown,
    booking?: unknown,
  ): Promise<void> {
    await this.broadcast(event, { trip, booking });
  }
}

export const ridesRealtimeService = new RidesRealtimeService();
