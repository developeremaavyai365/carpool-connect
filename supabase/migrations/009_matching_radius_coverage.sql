-- 50 km radius matching: coverage waypoints + PostGIS indexes
-- Run after 003_geospatial_rides.sql

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS coverage_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS matching_radius_m INTEGER NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS coverage_geog geography(MultiPoint, 4326);

COMMENT ON COLUMN public.trips.coverage_points IS 'Ordered source/stopover/destination waypoints for radius matching';
COMMENT ON COLUMN public.trips.matching_radius_m IS 'Matching radius in meters (default 50 km)';
COMMENT ON COLUMN public.trips.coverage_geog IS 'PostGIS MultiPoint for ST_DWithin radius queries';

CREATE INDEX IF NOT EXISTS idx_trips_coverage_geog_gist
  ON public.trips USING GIST (coverage_geog);

-- Backfill source + destination coverage for existing trips
UPDATE public.trips
SET
  coverage_points = jsonb_build_array(
    jsonb_build_object('lat', source_lat, 'lng', source_lng, 'idx', 0, 'role', 'source'),
    jsonb_build_object('lat', dest_lat, 'lng', dest_lng, 'idx', 1, 'role', 'destination')
  ),
  coverage_geog = ST_GeogFromText(
    format('SRID=4326;MULTIPOINT(%s %s, %s %s)', source_lng, source_lat, dest_lng, dest_lat)
  ),
  matching_radius_m = COALESCE(matching_radius_m, 50000)
WHERE coverage_geog IS NULL
  AND source_lat IS NOT NULL
  AND dest_lat IS NOT NULL;
