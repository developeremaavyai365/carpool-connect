-- DEPRECATED: Do not use for Carpool Connect. Use migration 003 (trips + published_commutes) instead.
-- BlaBlaCar-style platform schema (UUID + PostGIS)
-- Extends existing users; replaces legacy trips/bookings when empty

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop legacy geospatial tables if empty (003) to avoid name conflicts
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.trips) = 0 THEN
    DROP TABLE IF EXISTS public.bookings CASCADE;
    DROP TABLE IF EXISTS public.trips CASCADE;
  END IF;
END $$;

-- ─── Auth credentials (NestJS JWT auth) ───
CREATE TABLE IF NOT EXISTS public.auth_credentials (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Profiles ───
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  city TEXT DEFAULT '',
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Drivers ───
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  license_number TEXT DEFAULT '',
  vehicle_model TEXT DEFAULT '',
  vehicle_plate TEXT DEFAULT '',
  rating_avg REAL NOT NULL DEFAULT 5.0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  rating_count INTEGER NOT NULL DEFAULT 0,
  cancellation_count INTEGER NOT NULL DEFAULT 0,
  total_rides INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Passengers ───
CREATE TABLE IF NOT EXISTS public.passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  rating_avg REAL NOT NULL DEFAULT 5.0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  rating_count INTEGER NOT NULL DEFAULT 0,
  total_bookings INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Rides ───
CREATE TABLE IF NOT EXISTS public.rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  price_per_seat NUMERIC(10,2) NOT NULL DEFAULT 0,
  route_distance_m INTEGER,
  route_duration_s INTEGER,
  route_polyline TEXT,
  route_geometry GEOGRAPHY(LINESTRING, 4326),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'full', 'cancelled', 'completed', 'in_progress')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rides_route_geometry_gist ON public.rides USING GIST (route_geometry);
CREATE INDEX IF NOT EXISTS idx_rides_active_departure ON public.rides (departure_at ASC)
  WHERE status = 'active' AND seats_available > 0;
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides (driver_id);

-- ─── Bookings ───
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  passenger_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seats INTEGER NOT NULL DEFAULT 1 CHECK (seats > 0),
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  drop_lat DOUBLE PRECISION NOT NULL,
  drop_lng DOUBLE PRECISION NOT NULL,
  pickup_label TEXT DEFAULT '',
  drop_label TEXT DEFAULT '',
  price_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_ride_id ON public.bookings (ride_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_id ON public.bookings (passenger_id);

-- ─── Payments ───
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('razorpay', 'stripe', 'manual')),
  provider_payment_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments (booking_id);

-- ─── Reviews ───
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  reviewer_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewee_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  moderation_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reviewer_id)
);

-- ─── Route cache ───
CREATE TABLE IF NOT EXISTS public.route_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  source_lat DOUBLE PRECISION NOT NULL,
  source_lng DOUBLE PRECISION NOT NULL,
  dest_lat DOUBLE PRECISION NOT NULL,
  dest_lng DOUBLE PRECISION NOT NULL,
  polyline TEXT NOT NULL,
  distance_m INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  line_wkt TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_cache_expires ON public.route_cache (expires_at);

-- ─── Audit logs ───
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- ─── Refresh tokens ───
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens (user_id);

-- ─── Platform notifications (extends existing) ───
CREATE TABLE IF NOT EXISTS public.platform_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_notifications_user ON public.platform_notifications (user_id, is_read);

-- ─── Atomic booking function ───
CREATE OR REPLACE FUNCTION public.book_ride_seats(
  p_ride_id UUID,
  p_passenger_id BIGINT,
  p_seats INTEGER,
  p_pickup_lat DOUBLE PRECISION,
  p_pickup_lng DOUBLE PRECISION,
  p_drop_lat DOUBLE PRECISION,
  p_drop_lng DOUBLE PRECISION,
  p_pickup_label TEXT DEFAULT '',
  p_drop_label TEXT DEFAULT '',
  p_price_total NUMERIC DEFAULT 0
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id FOR UPDATE;
  IF NOT FOUND OR v_ride.status <> 'active' THEN
    RAISE EXCEPTION 'Ride not available';
  END IF;
  IF v_ride.driver_id = p_passenger_id THEN
    RAISE EXCEPTION 'Cannot book your own ride';
  END IF;
  IF v_ride.seats_available < p_seats THEN
    RAISE EXCEPTION 'Not enough seats available';
  END IF;

  UPDATE public.rides
  SET seats_available = seats_available - p_seats,
      status = CASE WHEN seats_available - p_seats <= 0 THEN 'full' ELSE status END,
      updated_at = now()
  WHERE id = p_ride_id;

  INSERT INTO public.bookings (
    ride_id, passenger_id, seats,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    pickup_label, drop_label, price_total, status
  ) VALUES (
    p_ride_id, p_passenger_id, p_seats,
    p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng,
    p_pickup_label, p_drop_label, p_price_total, 'confirmed'
  )
  RETURNING * INTO v_booking;

  UPDATE public.passengers SET total_bookings = total_bookings + 1, updated_at = now()
  WHERE user_id = p_passenger_id;

  RETURN v_booking;
END;
$$;

-- Realtime
ALTER TABLE public.rides REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rides_public_select ON public.rides;
CREATE POLICY rides_public_select ON public.rides FOR SELECT
  USING (status IN ('active', 'full') OR driver_id = current_app_user_id());

DROP POLICY IF EXISTS rides_driver_insert ON public.rides;
CREATE POLICY rides_driver_insert ON public.rides FOR INSERT
  WITH CHECK (driver_id = current_app_user_id());

DROP POLICY IF EXISTS rides_driver_update ON public.rides;
CREATE POLICY rides_driver_update ON public.rides FOR UPDATE
  USING (driver_id = current_app_user_id());

DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select ON public.bookings FOR SELECT
  USING (passenger_id = current_app_user_id()
    OR ride_id IN (SELECT id FROM public.rides WHERE driver_id = current_app_user_id()));

DROP POLICY IF EXISTS bookings_insert ON public.bookings;
CREATE POLICY bookings_insert ON public.bookings FOR INSERT
  WITH CHECK (passenger_id = current_app_user_id());

DROP POLICY IF EXISTS profiles_own ON public.profiles;
CREATE POLICY profiles_own ON public.profiles FOR ALL
  USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());

DROP POLICY IF EXISTS platform_notifications_own ON public.platform_notifications;
CREATE POLICY platform_notifications_own ON public.platform_notifications FOR ALL
  USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
