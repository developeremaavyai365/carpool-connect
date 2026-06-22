import type { BookTripDto, PublishTripDto, TripRow } from '../types/dto';
import { tripRepository } from '../repositories/trip.repository';
import { bookingRepository } from '../repositories/booking.repository';
import { routeService } from './route.service';
import { cacheService } from './cache.service';
import { ridesRealtimeService } from './realtime.service';
import { notificationRepository } from '../repositories/notification.repository';
import { paymentService } from './payment.service';
import { buildCoveragePoints, coverageToMultiPointWkt } from '../utils/coverage';
import { MATCHING_RADIUS_M } from '../config/constants';

function buildCoverageMeta(dto: PublishTripDto) {
  const coverage_points = buildCoveragePoints(
    { lat: dto.source_lat, lng: dto.source_lng },
    { lat: dto.dest_lat, lng: dto.dest_lng },
    dto.stopover_coords || [],
  );
  return {
    coverage_points,
    coverage_wkt: coverageToMultiPointWkt(coverage_points),
    matching_radius_m: MATCHING_RADIUS_M,
  };
}

export class TripService {
  async publish(driverId: number, dto: PublishTripDto): Promise<TripRow> {
    const route = await routeService.getRoute(
      { lat: dto.source_lat, lng: dto.source_lng },
      { lat: dto.dest_lat, lng: dto.dest_lng },
    );
    return this.publishWithRoute(driverId, dto, route);
  }

  async publishWithRoute(
    driverId: number,
    dto: PublishTripDto,
    route: { distance_m: number; duration_s: number; polyline: string; lineWkt: string },
  ): Promise<TripRow> {
    const coverage = buildCoverageMeta(dto);
    const trip = await tripRepository.create(driverId, dto, {
      distance_m: route.distance_m,
      duration_s: route.duration_s,
      polyline: route.polyline,
      lineWkt: route.lineWkt,
    }, coverage);

    await cacheService.invalidateSearch();
    await cacheService.invalidateActiveTrips();
    await ridesRealtimeService.broadcast('trip:created', { trip });

    return trip;
  }

  async updateByCommuteId(
    driverId: number,
    commuteId: number,
    dto: PublishTripDto,
  ): Promise<TripRow | null> {
    const route = await routeService.getRoute(
      { lat: dto.source_lat, lng: dto.source_lng },
      { lat: dto.dest_lat, lng: dto.dest_lng },
    );

    const coverage = buildCoverageMeta(dto);
    const trip = await tripRepository.updateByCommuteId(driverId, commuteId, dto, {
      distance_m: route.distance_m,
      duration_s: route.duration_s,
      polyline: route.polyline,
      lineWkt: route.lineWkt,
    }, coverage);

    if (trip) {
      await cacheService.invalidateSearch();
      await ridesRealtimeService.broadcast('trip:updated', { trip });
    }
    return trip;
  }

  async cancel(tripId: number, driverId: number): Promise<TripRow | null> {
    const trip = await tripRepository.cancel(tripId, driverId);
    if (trip) {
      await cacheService.invalidateSearch();
      await ridesRealtimeService.broadcast('trip:cancelled', { trip });
    }
    return trip;
  }

  async getById(id: number): Promise<TripRow | null> {
    return tripRepository.findById(id);
  }
}

export class BookingService {
  async book(passengerId: number, dto: BookTripDto) {
    if (process.env.ALLOW_INSTANT_BOOKING !== 'true') {
      throw Object.assign(
        new Error('Direct booking is disabled. Send a seat request and wait for the driver to accept.'),
        { status: 403 },
      );
    }

    const trip = await tripRepository.findById(dto.trip_id);
    if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
    if (trip.status !== 'active') throw Object.assign(new Error('Trip not available'), { status: 409 });
    if (Number(trip.driver_id) === Number(passengerId)) {
      throw Object.assign(new Error('You cannot book your own commute.'), { status: 403 });
    }

    const seats = dto.seats ?? 1;
    const priceTotal = trip.price_per_seat * seats;

    const booking = await bookingRepository.book(passengerId, dto, priceTotal);
    const updatedTrip = await tripRepository.findById(dto.trip_id);

    await notificationRepository.create(
      trip.driver_id,
      'booking_created',
      'New booking',
      `A passenger booked ${seats} seat(s) on your trip ${trip.source_label} → ${trip.dest_label}.`,
    );
    await notificationRepository.create(
      passengerId,
      'booking_confirmed',
      'Booking confirmed',
      `Your seat on ${trip.source_label} → ${trip.dest_label} is confirmed.`,
    );

    const payment = await paymentService.createForBooking(
      booking.id,
      passengerId,
      priceTotal,
    );

    await cacheService.invalidateSearch();
    await ridesRealtimeService.broadcast('trip:booked', { trip: updatedTrip || trip, booking });
    await ridesRealtimeService.broadcast('seat_changed', { trip: updatedTrip || trip, booking });

    return { booking, trip: updatedTrip, payment: payment.payment };
  }

  async cancelBooking(bookingId: number, passengerId: number) {
    const booking = await bookingRepository.cancel(bookingId, passengerId);
    const trip = await tripRepository.findById(booking.trip_id);

    if (trip) {
      await notificationRepository.create(
        trip.driver_id,
        'booking_cancelled',
        'Booking cancelled',
        `A passenger cancelled their booking on ${trip.source_label} → ${trip.dest_label}.`,
      );
    }

    await cacheService.invalidateSearch();
    await ridesRealtimeService.broadcast('booking_cancelled', { booking, trip });
    if (trip) await ridesRealtimeService.broadcast('seat_changed', { trip, booking });

    return { booking, trip };
  }

  async listForPassenger(passengerId: number) {
    return bookingRepository.findByPassenger(passengerId);
  }

  async listForDriver(driverId: number) {
    return bookingRepository.findByDriver(driverId);
  }
}

export const tripService = new TripService();
export const bookingService = new BookingService();
