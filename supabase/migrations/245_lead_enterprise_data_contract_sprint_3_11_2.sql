-- Sprint 3.11.2 — Enterprise Leads data contract
-- Additive columns only. Never drop data.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS expected_close_date date,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_temperature_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_temperature_check
      CHECK (temperature IS NULL OR temperature IN ('hot', 'warm', 'cold'));
  END IF;
END $$;

-- Backfill last activity from updated_at when null.
UPDATE public.leads
SET last_activity_at = COALESCE(last_activity_at, updated_at)
WHERE last_activity_at IS NULL
  AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_expected_close_date
  ON public.leads (company_id, expected_close_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_activity_at
  ON public.leads (company_id, last_activity_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_temperature
  ON public.leads (company_id, temperature)
  WHERE deleted_at IS NULL AND temperature IS NOT NULL;

COMMENT ON COLUMN public.leads.expected_close_date IS 'Sprint 3.11.2 — expected close date for CRM forecasting';
COMMENT ON COLUMN public.leads.last_activity_at IS 'Sprint 3.11.2 — last meaningful lead activity timestamp';
COMMENT ON COLUMN public.leads.temperature IS 'Sprint 3.11.2 — hot | warm | cold sales temperature';
COMMENT ON COLUMN public.leads.notes IS 'Sprint 3.11.2 — primary lead notes (inline CRM notes)';
COMMENT ON COLUMN public.leads.tags IS 'Sprint 3.11.2 — denormalized lead tags for list/filter';
