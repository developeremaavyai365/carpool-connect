-- Fix RLS: passengers must read upcoming listings, not only active
DROP POLICY IF EXISTS commutes_select ON public.published_commutes;
CREATE POLICY commutes_select ON public.published_commutes FOR SELECT TO authenticated
  USING (status IN ('active', 'upcoming') OR driver_id = public.current_app_user_id());
