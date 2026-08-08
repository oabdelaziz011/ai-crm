-- Sprint 4.2: Enterprise Quote Builder foundation.
-- References Opportunity + Product Catalog; snapshots commercial values only.

insert into public.permissions (code, category, module, action, description)
values
  ('quotes.view', 'Quotes', 'Quotes', 'View', 'View quotes'),
  ('quotes.create', 'Quotes', 'Quotes', 'Create', 'Create quotes'),
  ('quotes.edit', 'Quotes', 'Quotes', 'Edit', 'Edit draft quotes'),
  ('quotes.delete', 'Quotes', 'Quotes', 'Delete', 'Archive quotes'),
  ('quotes.send', 'Quotes', 'Quotes', 'Send', 'Send quotes to customers'),
  ('quotes.approve', 'Quotes', 'Quotes', 'Approve', 'Approve or reject quote approvals')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'quotes.view'), ('admin', 'quotes.create'), ('admin', 'quotes.edit'),
    ('admin', 'quotes.delete'), ('admin', 'quotes.send'), ('admin', 'quotes.approve'),
    ('manager', 'quotes.view'), ('manager', 'quotes.create'), ('manager', 'quotes.edit'),
    ('manager', 'quotes.send'), ('manager', 'quotes.approve'),
    ('employee', 'quotes.view'), ('employee', 'quotes.create'), ('employee', 'quotes.edit')
) as v(template_key, permission_code)
on conflict do nothing;

create table if not exists public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  slug text not null,
  description text not null default '',
  default_language text not null default 'en',
  default_currency text not null default 'USD',
  validity_days int not null default 30 check (validity_days > 0),
  body_json jsonb not null default '{"sections":[]}'::jsonb,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, slug)
);

create index if not exists idx_quote_templates_company
  on public.quote_templates(company_id) where deleted_at is null;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_family_id uuid not null,
  version_number int not null default 1 check (version_number >= 1),
  quote_number text not null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  template_id uuid references public.quote_templates(id) on delete set null,
  status text not null default 'draft'
    check (status in (
      'draft', 'internal_review', 'sent', 'viewed', 'accepted',
      'rejected', 'expired', 'converted'
    )),
  title text not null default '',
  contact_name text not null default '',
  currency text not null default 'USD',
  language text not null default 'en',
  country text,
  market text,
  valid_until date,
  owner_user_id uuid references auth.users(id) on delete set null,
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  shipping_total numeric(14, 2) not null default 0, -- placeholder
  grand_total numeric(14, 2) not null default 0,
  weighted_revenue numeric(14, 2),
  opportunity_probability_percent int,
  notes text not null default '',
  is_current boolean not null default true,
  superseded_by_quote_id uuid,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  converted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, quote_number, version_number)
);

create index if not exists idx_quotes_company_status
  on public.quotes(company_id, status) where deleted_at is null;

create index if not exists idx_quotes_opportunity
  on public.quotes(opportunity_id) where deleted_at is null and opportunity_id is not null;

create index if not exists idx_quotes_family
  on public.quotes(quote_family_id, version_number);

alter table public.quotes
  add constraint quotes_superseded_by_fkey
  foreign key (superseded_by_quote_id) references public.quotes(id) on delete set null;

create table if not exists public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  line_kind text not null default 'product'
    check (line_kind in ('product', 'service', 'bundle', 'addon', 'manual', 'optional', 'section', 'note')),
  product_id uuid references public.catalog_products(id) on delete set null,
  product_name_snapshot text not null default '',
  sku_snapshot text not null default '',
  section_title text,
  notes text not null default '',
  is_optional boolean not null default false,
  quantity numeric(14, 4) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  discount_percent numeric(8, 4) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  discount_amount numeric(14, 2) not null default 0,
  tax_percent numeric(8, 4) not null default 0
    check (tax_percent >= 0 and tax_percent <= 100),
  currency text not null default 'USD',
  subtotal numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  sort_order int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_quote_line_items_quote
  on public.quote_line_items(quote_id, sort_order) where deleted_at is null;

create table if not exists public.quote_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text not null default '',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_approvals_quote
  on public.quote_approvals(quote_id, requested_at desc);

create table if not exists public.quote_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  event_type text not null,
  field_name text,
  previous_value text,
  new_value text,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_history_quote
  on public.quote_history(quote_id, created_at desc);

-- Opportunity → current quote reference (no duplicated quote data)
alter table public.opportunities
  add column if not exists current_quote_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_current_quote_id_fkey'
  ) then
    alter table public.opportunities
      add constraint opportunities_current_quote_id_fkey
      foreign key (current_quote_id) references public.quotes(id) on delete set null;
  end if;
exception when others then null;
end $$;

alter table public.quote_templates enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.quote_approvals enable row level security;
alter table public.quote_history enable row level security;

create policy quote_templates_tenant on public.quote_templates
  for all using (public.company_has_permission(company_id, 'quotes.view'));

create policy quotes_tenant on public.quotes
  for all using (public.company_has_permission(company_id, 'quotes.view'));

create policy quote_line_items_tenant on public.quote_line_items
  for all using (public.company_has_permission(company_id, 'quotes.view'));

create policy quote_approvals_tenant on public.quote_approvals
  for all using (public.company_has_permission(company_id, 'quotes.view'));

create policy quote_history_tenant on public.quote_history
  for all using (public.company_has_permission(company_id, 'quotes.view'));

-- Seed default templates per company on first use via app; provide helper RPC
create or replace function public.quote_platform_ensure_default_templates(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.quote_templates (company_id, name, slug, description, body_json)
  values
    (p_company_id, 'CRM Implementation', 'crm-implementation', 'Standard CRM implementation package',
      '{"sections":[{"title":"Implementation","items":[]}]}'::jsonb),
    (p_company_id, 'Software License', 'software-license', 'Software license quotation',
      '{"sections":[{"title":"Licenses","items":[]}]}'::jsonb),
    (p_company_id, 'Support Package', 'support-package', 'Ongoing support package',
      '{"sections":[{"title":"Support","items":[]}]}'::jsonb)
  on conflict (company_id, slug) do nothing;
end;
$$;
