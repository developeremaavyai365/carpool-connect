-- Reviews, route cache, payments (requires trips from 005)

CREATE TABLE IF NOT EXISTS public.route_cache (
  id BIGSERIAL PRIMARY KEY,
  source_lat DOUBLE PRECISION NOT NULL,
  source_lng DOUBLE PRECISION NOT NULL,
  dest_lat DOUBLE PRECISION NOT NULL,
  dest_lng DOUBLE PRECISION NOT NULL,
  polyline TEXT NOT NULL,
  distance_m INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  line_wkt TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'ors',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_cache_endpoints
  ON public.route_cache (
    round(source_lat::numeric, 4), round(source_lng::numeric, 4),
    round(dest_lat::numeric, 4), round(dest_lng::numeric, 4)
  );

CREATE TABLE IF NOT EXISTS public.trip_reviews (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  booking_id BIGINT REFERENCES public.bookings(id) ON DELETE SET NULL,
  reviewer_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewee_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('passenger', 'driver')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_reviews_reviewee ON public.trip_reviews (reviewee_id);

CREATE TABLE IF NOT EXISTS public.trip_payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  passenger_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_payments_booking ON public.trip_payments (booking_id);

CREATE OR REPLACE FUNCTION public.cancel_trip_booking(p_booking_id BIGINT, p_passenger_id BIGINT)
RETURNS public.bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking public.bookings; v_trip public.trips;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id AND passenger_id = p_passenger_id AND status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = v_booking.trip_id FOR UPDATE;
  UPDATE public.bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;
  UPDATE public.trips SET seats_available = seats_available + v_booking.seats,
    status = CASE WHEN status IN ('full', 'cancelled') AND seats_available + v_booking.seats > 0 THEN 'active' ELSE status END,
    updated_at = now() WHERE id = v_booking.trip_id;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  RETURN v_booking;
END; $$;

ALTER TABLE public.trip_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trip_reviews_select ON public.trip_reviews;
CREATE POLICY trip_reviews_select ON public.trip_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS trip_reviews_insert ON public.trip_reviews;
CREATE POLICY trip_reviews_insert ON public.trip_reviews FOR INSERT WITH CHECK (reviewer_id = current_app_user_id());
DROP POLICY IF EXISTS trip_payments_select ON public.trip_payments;
CREATE POLICY trip_payments_select ON public.trip_payments FOR SELECT USING (passenger_id = current_app_user_id());
