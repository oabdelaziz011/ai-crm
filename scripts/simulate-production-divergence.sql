-- Local production divergence simulation (schema only).
-- Removes objects reported missing on production. Does NOT touch schema_migrations.

-- Ticket platform (214)
DROP TABLE IF EXISTS public.support_ticket_comments CASCADE;
DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP SEQUENCE IF EXISTS public.support_ticket_number_seq CASCADE;

-- Licensing / feature flags (224) — drop dependents first
DROP TABLE IF EXISTS public.platform_feature_flag_versions CASCADE;
DROP TABLE IF EXISTS public.platform_feature_flags CASCADE;
DROP TABLE IF EXISTS public.platform_company_licenses CASCADE;

-- Leads (218) — drop children then leads
DROP TABLE IF EXISTS public.lead_assignments CASCADE;
DROP TABLE IF EXISTS public.lead_scores CASCADE;
DROP TABLE IF EXISTS public.lead_tags CASCADE;
DROP TABLE IF EXISTS public.lead_notes CASCADE;
DROP TABLE IF EXISTS public.lead_activities CASCADE;
DROP TABLE IF EXISTS public.lead_history CASCADE;
DROP TABLE IF EXISTS public.lead_conversion_history CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;

-- Clear FK columns that reference dropped leads (219/227) without dropping parent tables
ALTER TABLE IF EXISTS public.conversations
  DROP COLUMN IF EXISTS lead_id;
ALTER TABLE IF EXISTS public.scheduling_bookings
  DROP COLUMN IF EXISTS lead_id,
  DROP COLUMN IF EXISTS conversation_id;
