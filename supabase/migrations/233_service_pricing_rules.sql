-- Sprint Services Pricing 2.0 — configurable service pricing rules.
-- Types are company-scoped and seedable (not hardcoded visit types in app code).
-- Booking continues to snapshot price/currency/duration at create time.

ALTER TABLE public.scheduling_services
  ADD COLUMN IF NOT EXISTS category text;

CREATE TABLE IF NOT EXISTS public.scheduling_pricing_rule_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_pricing_rule_types_code_nonempty CHECK (char_length(trim(code)) > 0),
  CONSTRAINT scheduling_pricing_rule_types_label_nonempty CHECK (char_length(trim(label)) > 0),
  CONSTRAINT scheduling_pricing_rule_types_company_code_unique UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_scheduling_pricing_rule_types_company
  ON public.scheduling_pricing_rule_types(company_id, sort_order);

CREATE TABLE IF NOT EXISTS public.scheduling_service_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.scheduling_services(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.scheduling_pricing_rule_types(id) ON DELETE RESTRICT,
  price_cents integer NOT NULL,
  currency text NOT NULL,
  duration_minutes integer NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT scheduling_service_pricing_rules_price_positive CHECK (price_cents > 0),
  CONSTRAINT scheduling_service_pricing_rules_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT scheduling_service_pricing_rules_currency_nonempty CHECK (char_length(trim(currency)) = 3)
);

CREATE INDEX IF NOT EXISTS idx_scheduling_service_pricing_rules_service
  ON public.scheduling_service_pricing_rules(service_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduling_service_pricing_rules_company
  ON public.scheduling_service_pricing_rules(company_id)
  WHERE deleted_at IS NULL;

-- Only one active default rule per service.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduling_service_pricing_rules_one_default
  ON public.scheduling_service_pricing_rules(service_id)
  WHERE is_default = true AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS scheduling_pricing_rule_types_updated_at ON public.scheduling_pricing_rule_types;
CREATE TRIGGER scheduling_pricing_rule_types_updated_at
  BEFORE UPDATE ON public.scheduling_pricing_rule_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS scheduling_service_pricing_rules_updated_at ON public.scheduling_service_pricing_rules;
CREATE TRIGGER scheduling_service_pricing_rules_updated_at
  BEFORE UPDATE ON public.scheduling_service_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scheduling_pricing_rule_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_service_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduling_pricing_rule_types_select ON public.scheduling_pricing_rule_types;
CREATE POLICY scheduling_pricing_rule_types_select ON public.scheduling_pricing_rule_types
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (public.is_super_admin() OR company_id = public.current_company_id())
  );

DROP POLICY IF EXISTS scheduling_pricing_rule_types_insert ON public.scheduling_pricing_rule_types;
CREATE POLICY scheduling_pricing_rule_types_insert ON public.scheduling_pricing_rule_types
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      public.is_super_admin()
      OR (company_id = public.current_company_id() AND public.user_has_permission('scheduling.edit'))
    )
  );

DROP POLICY IF EXISTS scheduling_pricing_rule_types_update ON public.scheduling_pricing_rule_types;
CREATE POLICY scheduling_pricing_rule_types_update ON public.scheduling_pricing_rule_types
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND (
      public.is_super_admin()
      OR (company_id = public.current_company_id() AND public.user_has_permission('scheduling.edit'))
    )
  );

DROP POLICY IF EXISTS scheduling_service_pricing_rules_select ON public.scheduling_service_pricing_rules;
CREATE POLICY scheduling_service_pricing_rules_select ON public.scheduling_service_pricing_rules
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (public.is_super_admin() OR company_id = public.current_company_id())
  );

DROP POLICY IF EXISTS scheduling_service_pricing_rules_insert ON public.scheduling_service_pricing_rules;
CREATE POLICY scheduling_service_pricing_rules_insert ON public.scheduling_service_pricing_rules
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      public.is_super_admin()
      OR (company_id = public.current_company_id() AND public.user_has_permission('scheduling.edit'))
    )
  );

DROP POLICY IF EXISTS scheduling_service_pricing_rules_update ON public.scheduling_service_pricing_rules;
CREATE POLICY scheduling_service_pricing_rules_update ON public.scheduling_service_pricing_rules
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND (
      public.is_super_admin()
      OR (company_id = public.current_company_id() AND public.user_has_permission('scheduling.edit'))
    )
  );

-- Seed default type catalog for every company that has services (or any company).
INSERT INTO public.scheduling_pricing_rule_types (company_id, code, label, sort_order, active)
SELECT c.id, seed.code, seed.label, seed.sort_order, true
FROM public.companies c
CROSS JOIN (
  VALUES
    ('New', 'New', 0),
    ('FollowUp', 'Follow Up', 1),
    ('Consultation', 'Consultation', 2),
    ('Emergency', 'Emergency', 3),
    ('VIP', 'VIP', 4)
) AS seed(code, label, sort_order)
ON CONFLICT (company_id, code) DO NOTHING;

-- Migrate existing service price/currency/duration into a default "New" pricing rule.
INSERT INTO public.scheduling_service_pricing_rules (
  company_id,
  service_id,
  type_id,
  price_cents,
  currency,
  duration_minutes,
  is_default,
  description
)
SELECT
  s.company_id,
  s.id,
  t.id,
  GREATEST(COALESCE(s.price_cents, 0), 1),
  UPPER(COALESCE(NULLIF(TRIM(s.currency), ''), 'USD')),
  GREATEST(COALESCE(s.duration_minutes, 30), 1),
  true,
  'Migrated from legacy service price'
FROM public.scheduling_services s
JOIN public.scheduling_pricing_rule_types t
  ON t.company_id = s.company_id
 AND t.code = 'New'
WHERE s.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.scheduling_service_pricing_rules r
    WHERE r.service_id = s.id
      AND r.deleted_at IS NULL
  );

COMMENT ON TABLE public.scheduling_pricing_rule_types IS
  'Configurable pricing rule type catalog (company-scoped). Seeded defaults; custom types allowed without code changes.';
COMMENT ON TABLE public.scheduling_service_pricing_rules IS
  'Per-service pricing rules. Booking copies price/currency/duration from the selected or default rule at create time.';
