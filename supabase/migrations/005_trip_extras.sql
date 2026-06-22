-- Restore Carpool Connect geospatial tables (migration 004 dropped empty trips).

CREATE EXTENSION IF NOT EXISTS postgis;

-- Remove deprecated UUID platform tables (migration 004) if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'ride_id'
  ) THEN
    DROP TABLE IF EXISTS public.trip_payments CASCADE;
    DROP TABLE IF EXISTS public.trip_reviews CASCADE;
    DROP TABLE public.bookings CASCADE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rides'
  ) THEN
    DROP TABLE public.rides CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.driver_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  rating_avg REAL NOT NULL DEFAULT 5.0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  rating_count INTEGER NOT NULL DEFAULT 0,
  cancellation_count INTEGER NOT NULL DEFAULT 0,
  total_trips INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trips (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_label TEXT NOT NULL,
  dest_label TEXT NOT NULL,
  source_lat DOUBLE PRECISION NOT NULL,
  source_lng DOUBLE PRECISION NOT NULL,
  dest_lat DOUBLE PRECISION NOT NULL,
  dest_lng DOUBLE PRECISION NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  departure_at TIMESTAMPTZ NOT NULL,
  seats_total INTEGER NOT NULL CHECK (seats_total > 0),
  seats_available INTEGER NOT NULL CHECK (seats_available >= 0),
  price_per_seat REAL NOT NULL DEFAULT 0,
  route_distance_m INTEGER,
  route_duration_s INTEGER,
  route_polyline TEXT,
  route_geometry GEOGRAPHY(LINESTRING, 4326),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'full', 'cancelled', 'completed')),
  commute_id BIGINT REFERENCES public.published_commutes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seats INTEGER NOT NULL DEFAULT 1 CHECK (seats > 0),
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  drop_lat DOUBLE PRECISION NOT NULL,
  drop_lng DOUBLE PRECISION NOT NULL,
  pickup_label TEXT DEFAULT '',
  drop_label TEXT DEFAULT '',
  price_total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trips_route_geometry_gist ON public.trips USING GIST (route_geometry);
CREATE INDEX IF NOT EXISTS idx_trips_active_departure ON public.trips (departure_at ASC) WHERE status = 'active' AND seats_available > 0;
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON public.trips (driver_id);
CREATE INDEX IF NOT EXISTS idx_bookings_trip_id ON public.bookings (trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_id ON public.bookings (passenger_id);

ALTER TABLE public.trips REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.trips; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trips_select ON public.trips;
CREATE POLICY trips_select ON public.trips FOR SELECT USING (status = 'active' OR driver_id = current_app_user_id());
DROP POLICY IF EXISTS trips_insert ON public.trips;
CREATE POLICY trips_insert ON public.trips FOR INSERT WITH CHECK (driver_id = current_app_user_id());
DROP POLICY IF EXISTS trips_update_own ON public.trips;
CREATE POLICY trips_update_own ON public.trips FOR UPDATE USING (driver_id = current_app_user_id());
DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select ON public.bookings FOR SELECT
  USING (passenger_id = current_app_user_id() OR trip_id IN (SELECT id FROM public.trips WHERE driver_id = current_app_user_id()));
DROP POLICY IF EXISTS bookings_insert ON public.bookings;
CREATE POLICY bookings_insert ON public.bookings FOR INSERT WITH CHECK (passenger_id = current_app_user_id());
DROP POLICY IF EXISTS driver_profiles_select ON public.driver_profiles;
CREATE POLICY driver_profiles_select ON public.driver_profiles FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.book_trip_seats(
  p_trip_id BIGINT, p_passenger_id BIGINT, p_seats INTEGER,
  p_pickup_lat DOUBLE PRECISION, p_pickup_lng DOUBLE PRECISION,
  p_drop_lat DOUBLE PRECISION, p_drop_lng DOUBLE PRECISION,
  p_pickup_label TEXT DEFAULT '', p_drop_label TEXT DEFAULT '', p_price_total REAL DEFAULT 0
)
RETURNS public.bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trip public.trips; v_booking public.bookings;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR v_trip.status <> 'active' THEN RAISE EXCEPTION 'Trip not available'; END IF;
  IF v_trip.driver_id = p_passenger_id THEN RAISE EXCEPTION 'Cannot book your own trip'; END IF;
  IF v_trip.seats_available < p_seats THEN RAISE EXCEPTION 'Not enough seats available'; END IF;
  UPDATE public.trips SET seats_available = seats_available - p_seats,
    status = CASE WHEN seats_available - p_seats <= 0 THEN 'full' ELSE status END, updated_at = now()
  WHERE id = p_trip_id;
  INSERT INTO public.bookings (trip_id, passenger_id, seats, pickup_lat, pickup_lng, drop_lat, drop_lng, pickup_label, drop_label, price_total, status)
  VALUES (p_trip_id, p_passenger_id, p_seats, p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng, p_pickup_label, p_drop_label, p_price_total, 'confirmed')
  RETURNING * INTO v_booking;
  RETURN v_booking;
END; $$;
