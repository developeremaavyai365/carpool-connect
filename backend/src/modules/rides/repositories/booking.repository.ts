import { queryOne, query } from './pg.client';
import type { BookingRow, BookTripDto } from '../types/dto';

export class BookingRepository {
  async book(
    passengerId: number,
    dto: BookTripDto,
    priceTotal: number,
  ): Promise<BookingRow> {
    try {
      const row = await queryOne<BookingRow>(
        `SELECT * FROM book_trip_seats(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )`,
        [
          dto.trip_id,
          passengerId,
          dto.seats ?? 1,
          dto.pickup_lat,
          dto.pickup_lng,
          dto.drop_lat,
          dto.drop_lng,
          dto.pickup_label || '',
          dto.drop_label || '',
          priceTotal,
        ],
      );
      if (!row) throw new Error('Booking failed');
      return row;
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('Cannot book your own')) {
        throw Object.assign(new Error('You cannot book your own commute.'), { status: 403 });
      }
      throw err;
    }
  }

  async findById(id: number): Promise<BookingRow | null> {
    return queryOne<BookingRow>(`SELECT * FROM bookings WHERE id = $1`, [id]);
  }

  async findByPassenger(passengerId: number) {
    return query(
      `SELECT b.*, t.source_label, t.dest_label, t.departure_at, u.name AS driver_name
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       JOIN users u ON u.id = t.driver_id
       WHERE b.passenger_id = $1
       ORDER BY b.created_at DESC LIMIT 50`,
      [passengerId],
    );
  }

  async findByDriver(driverId: number) {
    return query(
      `SELECT b.*, t.source_label, t.dest_label, u.name AS passenger_name
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       JOIN users u ON u.id = b.passenger_id
       WHERE t.driver_id = $1 AND b.status = 'confirmed'
       ORDER BY b.created_at DESC LIMIT 50`,
      [driverId],
    );
  }

  async cancel(bookingId: number, passengerId: number): Promise<BookingRow> {
    const row = await queryOne<BookingRow>(
      `SELECT * FROM cancel_trip_booking($1, $2)`,
      [bookingId, passengerId],
    );
    if (!row) throw new Error('Booking not found');
    return row;
  }
}

export const bookingRepository = new BookingRepository();
