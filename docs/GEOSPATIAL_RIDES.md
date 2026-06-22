# Smart Ride Matching — Carpool Connect

Production geospatial ride matching lives entirely in **Carpool Connect** (`backend/` + `frontend/`).

## Architecture

```
frontend/
  BrowseCommutes.jsx     → GET /api/rides/search (PostGIS)
  Publish.jsx            → POST /api/commutes → syncGeospatialTripFromCommute → trips
  CommuteDetailModal.jsx → POST /api/rides/book (instant book)

backend/src/modules/rides/
  routes/rides.routes.ts       API router
  controllers/rides.controller.ts
  services/
    matching.service.ts          Corridor search + polyline verify
    ranking.service.ts           Weighted scoring
    route.service.ts             ORS + OSRM + route_cache
    trip.service.ts              Publish, book, cancel
    cache.service.ts             Redis / memory
    realtime.service.ts          Supabase broadcast
    payment.service.ts           Razorpay / Stripe abstraction
    review.service.ts            Trip reviews
  repositories/
    trip.repository.ts           PostGIS queries
    booking.repository.ts        Atomic book/cancel
    route-cache.repository.ts
    review.repository.ts
    notification.repository.ts
  utils/geospatial.ts            isPointOnRoute, getRoutePosition, stopover verify
```

## Database (Supabase)

| Migration | Tables |
|-----------|--------|
| `003_geospatial_rides.sql` | `trips`, `bookings`, `driver_profiles`, `book_trip_seats()` |
| `005_trip_extras.sql` | `route_cache`, `trip_reviews`, `trip_payments`, `cancel_trip_booking()` |

- Route stored as `GEOGRAPHY(LINESTRING, 4326)` with GIST index
- Proximity threshold: **3 km** (`ROUTE_PROXIMITY_M`)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rides/search` | Smart corridor match + ranking |
| POST | `/api/rides` | Publish trip with ORS route |
| POST | `/api/rides/book` | Atomic seat booking |
| GET | `/api/rides/bookings/mine` | Passenger bookings |
| DELETE | `/api/rides/bookings/:id` | Cancel booking |
| POST | `/api/rides/reviews` | Leave review |
| DELETE | `/api/rides/:id` | Cancel trip |

## Matching algorithm

1. PostGIS `ST_DWithin` — pickup within 3 km of route
2. PostGIS `ST_DWithin` — drop within 3 km of route
3. `ST_LineLocatePoint` — pickup before drop on line
4. Filter full / inactive trips
5. Polyline verify: `isPassengerPathOnDriverRoute()` (Gurgaon→Neemrana on Delhi→Jaipur)
6. Rank by overlap, time, deviation, rating, cancellation, price

## Realtime events (Supabase channel `rides-public`)

`ride_created`, `trip:created`, `ride_updated`, `booking_created`, `booking_cancelled`, `seat_changed`

## Environment

```env
SUPABASE_DB_PASSWORD=...
OPENROUTESERVICE_API_KEY=...
REDIS_URL=redis://localhost:6379   # optional
RAZORPAY_KEY_ID=...                # optional
```

## Run

```bash
cd backend && npm run dev
cd frontend && npm run dev
npm run supabase:db:push   # apply migrations
```
