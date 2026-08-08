-- Sprint Queue 2.1: booking-owned service price snapshot, visit type, payment status.
-- Price is copied from scheduling_services at booking create time and never mutates with later service edits.

ALTER TABLE public.scheduling_bookings
  ADD COLUMN IF NOT EXISTS amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.scheduling_bookings.amount_cents IS
  'Service price snapshot (minor units) copied at booking create. Independent of later service price changes.';
COMMENT ON COLUMN public.scheduling_bookings.currency IS
  'ISO currency copied from the service at booking create.';
COMMENT ON COLUMN public.scheduling_bookings.visit_type IS
  'Booking visit type: New | FollowUp | Consultation | Emergency | VIP';
COMMENT ON COLUMN public.scheduling_bookings.payment_status IS
  'pending | partial | paid | refunded | cancelled';

-- Backfill snapshot from current service price for legacy rows (one-time).
UPDATE public.scheduling_bookings AS b
SET
  amount_cents = COALESCE(s.price_cents, 0),
  currency = UPPER(COALESCE(NULLIF(TRIM(s.currency), ''), 'USD'))
FROM public.scheduling_services AS s
WHERE b.service_id = s.id
  AND COALESCE(b.amount_cents, 0) = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduling_bookings_visit_type_check'
  ) THEN
    ALTER TABLE public.scheduling_bookings
      ADD CONSTRAINT scheduling_bookings_visit_type_check
      CHECK (visit_type IN ('New', 'FollowUp', 'Consultation', 'Emergency', 'VIP', 'Unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduling_bookings_payment_status_check'
  ) THEN
    ALTER TABLE public.scheduling_bookings
      ADD CONSTRAINT scheduling_bookings_payment_status_check
      CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded', 'cancelled'));
  END IF;
END $$;
