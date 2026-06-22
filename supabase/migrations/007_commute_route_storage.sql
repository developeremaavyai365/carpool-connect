-- Store computed route data on published commutes for reuse in search/matching
ALTER TABLE public.published_commutes
  ADD COLUMN IF NOT EXISTS source_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS source_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS stopover_coords JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS route_polyline TEXT,
  ADD COLUMN IF NOT EXISTS route_distance_m INTEGER,
  ADD COLUMN IF NOT EXISTS route_duration_s INTEGER,
  ADD COLUMN IF NOT EXISTS route_type TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS toll_info JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.published_commutes.route_polyline IS 'Encoded polyline from routing engine at publish time';
