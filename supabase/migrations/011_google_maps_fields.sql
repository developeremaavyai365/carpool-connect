-- Google Maps integration: normalized address + distance fields on published commutes
ALTER TABLE public.published_commutes
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS destination_address TEXT,
  ADD COLUMN IF NOT EXISTS destination_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS destination_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS estimated_duration INTEGER;

-- Backfill from existing route columns
UPDATE public.published_commutes
SET
  pickup_address = COALESCE(pickup_address, route_from),
  destination_address = COALESCE(destination_address, route_to),
  pickup_lat = COALESCE(pickup_lat, source_lat),
  pickup_lng = COALESCE(pickup_lng, source_lng),
  destination_lat = COALESCE(destination_lat, dest_lat),
  destination_lng = COALESCE(destination_lng, dest_lng),
  distance_km = COALESCE(distance_km, CASE WHEN route_distance_m IS NOT NULL THEN route_distance_m / 1000.0 END),
  estimated_duration = COALESCE(estimated_duration, route_duration_s)
WHERE pickup_address IS NULL
   OR destination_address IS NULL
   OR pickup_lat IS NULL
   OR distance_km IS NULL;

CREATE INDEX IF NOT EXISTS idx_commutes_pickup_coords
  ON public.published_commutes (pickup_lat, pickup_lng)
  WHERE pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commutes_destination_coords
  ON public.published_commutes (destination_lat, destination_lng)
  WHERE destination_lat IS NOT NULL AND destination_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commutes_distance_km
  ON public.published_commutes (distance_km)
  WHERE distance_km IS NOT NULL;

-- trips table aliases for ride discovery
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS destination_address TEXT,
  ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS estimated_duration INTEGER;

UPDATE public.trips
SET
  pickup_address = COALESCE(pickup_address, source_label),
  destination_address = COALESCE(destination_address, dest_label),
  distance_km = COALESCE(distance_km, CASE WHEN route_distance_m IS NOT NULL THEN route_distance_m / 1000.0 END),
  estimated_duration = COALESCE(estimated_duration, route_duration_s)
WHERE pickup_address IS NULL OR distance_km IS NULL;
