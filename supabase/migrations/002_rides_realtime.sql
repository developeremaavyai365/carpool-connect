-- Enable Supabase Realtime for published rides (published_commutes table)
-- Idempotent — safe to re-run

ALTER TABLE public.published_commutes REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.published_commutes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
