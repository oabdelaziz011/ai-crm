-- ============================================================
-- Vault OS – Billing: Extend Plans Catalog (Phase 1)
-- Architecture: billing-subscriptions.md v4 §8.1 migration 030
-- ============================================================

alter table public.plans
  add column if not exists display_name text,
  add column if not exists description text,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists max_users integer,
  add column if not exists max_customers integer,
  add column if not exists storage_gb numeric(12, 2),
  add column if not exists ai_tokens_monthly bigint,
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists tier_rank integer not null default 0;

update public.plans
set
  display_name = coalesce(display_name, name),
  description = coalesce(description, ''),
  is_active = coalesce(is_active, true),
  sort_order = case code
    when 'basic' then 1
    when 'pro' then 2
    when 'enterprise' then 3
    else coalesce(sort_order, 0)
  end,
  tier_rank = case code
    when 'basic' then 1
    when 'pro' then 2
    when 'enterprise' then 3
    else coalesce(tier_rank, 0)
  end,
  max_users = coalesce(max_users, case code when 'basic' then 5 when 'pro' then 25 when 'enterprise' then null else 5 end),
  max_customers = coalesce(max_customers, case code when 'basic' then 100 when 'pro' then 1000 when 'enterprise' then null else 100 end),
  storage_gb = coalesce(storage_gb, case code when 'basic' then 5 when 'pro' then 50 when 'enterprise' then 500 else 5 end),
  ai_tokens_monthly = coalesce(ai_tokens_monthly, case code when 'basic' then 50000 when 'pro' then 500000 when 'enterprise' then 5000000 else 50000 end),
  features = case
    when features is null or features = '[]'::jsonb then
      case code
        when 'basic' then '["core_crm","basic_reports"]'::jsonb
        when 'pro' then '["core_crm","advanced_reports","ai_assistant"]'::jsonb
        when 'enterprise' then '["core_crm","advanced_reports","ai_assistant","whatsapp_channel","api_access"]'::jsonb
        else '[]'::jsonb
      end
    else features
  end;

create index if not exists idx_plans_is_active_sort on public.plans(is_active, sort_order);
