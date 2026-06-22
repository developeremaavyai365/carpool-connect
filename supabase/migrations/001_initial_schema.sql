-- CarPool Connect — Supabase Postgres schema
-- Run in Supabase SQL Editor or: supabase db push

CREATE EXTENSION IF NOT EXISTS citext;

-- ─── Users (linked to Supabase Auth) ───
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email CITEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  user_type TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'register',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_details (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  home_address TEXT DEFAULT '',
  office_address TEXT DEFAULT 'Company HQ, Bangalore',
  route_from TEXT DEFAULT '',
  route_to TEXT DEFAULT '',
  city TEXT DEFAULT 'Bangalore',
  availability TEXT DEFAULT 'available',
  bio TEXT DEFAULT '',
  travel_preferences TEXT DEFAULT '',
  vehicle JSONB,
  recent_searches JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.published_commutes (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  route_from TEXT NOT NULL,
  route_to TEXT NOT NULL,
  city TEXT DEFAULT '',
  departure_at TIMESTAMPTZ NOT NULL,
  seats_available INTEGER NOT NULL,
  price_per_seat REAL NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  stopovers JSONB DEFAULT '[]'::jsonb,
  route_label TEXT DEFAULT '',
  route_detail TEXT DEFAULT '',
  smoking TEXT NOT NULL DEFAULT 'not_allowed',
  music TEXT NOT NULL DEFAULT 'any',
  pets TEXT NOT NULL DEFAULT 'not_allowed',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.carpool_requests (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES public.users(id),
  receiver_id BIGINT NOT NULL REFERENCES public.users(id),
  commute_id BIGINT REFERENCES public.published_commutes(id),
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_request_id BIGINT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES public.users(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  email_type TEXT NOT NULL DEFAULT 'notification',
  notification_id BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.notification_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id),
  notification_id BIGINT,
  email_queue_id BIGINT,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.otps (
  id BIGSERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(identifier, channel, purpose)
);

CREATE TABLE IF NOT EXISTS public.verification_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  identifier TEXT NOT NULL,
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.live_locations (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  city TEXT,
  route_from TEXT,
  name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
CREATE INDEX IF NOT EXISTS idx_notifications_employee ON public.notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_commutes_driver ON public.published_commutes(driver_id);
CREATE INDEX IF NOT EXISTS idx_commutes_departure ON public.published_commutes(departure_at);
CREATE INDEX IF NOT EXISTS idx_commutes_status ON public.published_commutes(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_queue(status);
CREATE INDEX IF NOT EXISTS idx_live_locations_city ON public.live_locations(city);

-- Realtime publication (idempotent — safe to re-run via supabase db push)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.carpool_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.published_commutes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Helper: resolve app user id from auth JWT ───
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ─── Row Level Security ───
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_commutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carpool_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

-- Users: read all authenticated profiles (directory), update own row
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users FOR UPDATE TO authenticated
  USING (auth_id = auth.uid());

-- User details: read all, update own
DROP POLICY IF EXISTS user_details_select ON public.user_details;
CREATE POLICY user_details_select ON public.user_details FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS user_details_update_own ON public.user_details;
CREATE POLICY user_details_update_own ON public.user_details FOR UPDATE TO authenticated
  USING (user_id = public.current_app_user_id());

-- Commutes: read active, manage own
DROP POLICY IF EXISTS commutes_select ON public.published_commutes;
CREATE POLICY commutes_select ON public.published_commutes FOR SELECT TO authenticated
  USING (status = 'active' OR driver_id = public.current_app_user_id());
DROP POLICY IF EXISTS commutes_insert ON public.published_commutes;
CREATE POLICY commutes_insert ON public.published_commutes FOR INSERT TO authenticated
  WITH CHECK (driver_id = public.current_app_user_id());
DROP POLICY IF EXISTS commutes_update_own ON public.published_commutes;
CREATE POLICY commutes_update_own ON public.published_commutes FOR UPDATE TO authenticated
  USING (driver_id = public.current_app_user_id());

-- Requests: involved parties only
DROP POLICY IF EXISTS requests_select ON public.carpool_requests;
CREATE POLICY requests_select ON public.carpool_requests FOR SELECT TO authenticated
  USING (sender_id = public.current_app_user_id() OR receiver_id = public.current_app_user_id());
DROP POLICY IF EXISTS requests_insert ON public.carpool_requests;
CREATE POLICY requests_insert ON public.carpool_requests FOR INSERT TO authenticated
  WITH CHECK (sender_id = public.current_app_user_id());

-- Notifications: own only
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (employee_id = public.current_app_user_id());
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (employee_id = public.current_app_user_id());

-- Live locations: read same city, upsert own
DROP POLICY IF EXISTS live_locations_select ON public.live_locations;
CREATE POLICY live_locations_select ON public.live_locations FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS live_locations_upsert ON public.live_locations;
CREATE POLICY live_locations_upsert ON public.live_locations FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());
