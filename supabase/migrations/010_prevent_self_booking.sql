-- Prevent drivers from creating passenger requests against their own commutes
CREATE OR REPLACE FUNCTION public.validate_carpool_request()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_driver_id BIGINT;
BEGIN
  IF NEW.commute_id IS NOT NULL THEN
    SELECT driver_id INTO v_driver_id
    FROM public.published_commutes
    WHERE id = NEW.commute_id;

    IF v_driver_id IS NOT NULL AND v_driver_id = NEW.sender_id THEN
      RAISE EXCEPTION 'You cannot book your own commute.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_carpool_request_no_self ON public.carpool_requests;
CREATE TRIGGER trg_carpool_request_no_self
  BEFORE INSERT ON public.carpool_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_carpool_request();
