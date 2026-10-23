-- Opportunity lifecycle redesign (local/dev):
-- 1) Lead lifecycle: demo_completed (human confirmed demo happened)
-- 2) Canonical commercial scope: opportunities.primary_product_id
-- 3) At most one open Opportunity per (company, customer, primary_product)
--
-- Does NOT auto-close/delete/merge opportunities. If open duplicates exist for the
-- uniqueness key, this migration raises and must be resolved manually.

-- ---------------------------------------------------------------------------
-- A. Lead lifecycle: demo_completed
-- ---------------------------------------------------------------------------
alter table public.lead_stages drop constraint if exists lead_stages_lifecycle_status_check;
alter table public.lead_stages
  add constraint lead_stages_lifecycle_status_check
  check (lifecycle_status = any (array[
    'new'::text, 'qualified'::text, 'contacted'::text,
    'demo_scheduled'::text, 'demo_completed'::text, 'proposal_sent'::text,
    'negotiation'::text, 'won'::text, 'lost'::text, 'converted'::text, 'archived'::text
  ]));

alter table public.leads drop constraint if exists leads_lifecycle_status_check;
alter table public.leads
  add constraint leads_lifecycle_status_check
  check (lifecycle_status = any (array[
    'new'::text, 'qualified'::text, 'contacted'::text,
    'demo_scheduled'::text, 'demo_completed'::text, 'proposal_sent'::text,
    'negotiation'::text, 'won'::text, 'lost'::text, 'converted'::text, 'archived'::text
  ]));

-- Make room in sort_order for Demo Completed (after Demo Scheduled).
update public.lead_stages s
set sort_order = s.sort_order + 1,
    updated_at = now()
where s.deleted_at is null
  and s.lifecycle_status in ('proposal_sent', 'negotiation', 'won', 'lost', 'converted', 'archived')
  and exists (
    select 1
    from public.lead_stages ds
    where ds.pipeline_id = s.pipeline_id
      and ds.deleted_at is null
      and ds.lifecycle_status = 'demo_scheduled'
  )
  and not exists (
    select 1
    from public.lead_stages dc
    where dc.pipeline_id = s.pipeline_id
      and dc.deleted_at is null
      and dc.lifecycle_status = 'demo_completed'
  );

insert into public.lead_stages (
  company_id, pipeline_id, name, slug, lifecycle_status, sort_order, probability_percent
)
select
  p.company_id,
  p.id,
  'Demo Completed',
  'demo_completed',
  'demo_completed',
  coalesce(
    (
      select ds.sort_order + 1
      from public.lead_stages ds
      where ds.pipeline_id = p.id
        and ds.deleted_at is null
        and ds.lifecycle_status = 'demo_scheduled'
      limit 1
    ),
    4
  ),
  50
from public.lead_pipelines p
where p.deleted_at is null
  and not exists (
    select 1
    from public.lead_stages s
    where s.pipeline_id = p.id
      and s.deleted_at is null
      and (s.slug = 'demo_completed' or s.lifecycle_status = 'demo_completed')
  );

create or replace function public.lead_platform_ensure_default_pipeline(p_company_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pipeline_id uuid;
begin
  select id into v_pipeline_id
  from public.lead_pipelines
  where company_id = p_company_id and is_default = true and deleted_at is null
  limit 1;

  if v_pipeline_id is not null then
    -- Backfill demo_completed on existing default pipelines created before this migration.
    if not exists (
      select 1 from public.lead_stages
      where pipeline_id = v_pipeline_id
        and deleted_at is null
        and (slug = 'demo_completed' or lifecycle_status = 'demo_completed')
    ) then
      update public.lead_stages
      set sort_order = sort_order + 1, updated_at = now()
      where pipeline_id = v_pipeline_id
        and deleted_at is null
        and lifecycle_status in ('proposal_sent', 'negotiation', 'won', 'lost', 'converted', 'archived');

      insert into public.lead_stages (
        company_id, pipeline_id, name, slug, lifecycle_status, sort_order, probability_percent
      )
      values (
        p_company_id, v_pipeline_id, 'Demo Completed', 'demo_completed', 'demo_completed',
        coalesce(
          (select sort_order + 1 from public.lead_stages
           where pipeline_id = v_pipeline_id and deleted_at is null
             and lifecycle_status = 'demo_scheduled' limit 1),
          4
        ),
        50
      );
    end if;
    return v_pipeline_id;
  end if;

  insert into public.lead_pipelines (company_id, name, slug, is_default, is_active)
  values (p_company_id, 'Default Pipeline', 'default', true, true)
  returning id into v_pipeline_id;

  insert into public.lead_stages (company_id, pipeline_id, name, slug, lifecycle_status, sort_order, probability_percent)
  values
    (p_company_id, v_pipeline_id, 'New', 'new', 'new', 0, 5),
    (p_company_id, v_pipeline_id, 'Qualified', 'qualified', 'qualified', 1, 20),
    (p_company_id, v_pipeline_id, 'Contacted', 'contacted', 'contacted', 2, 30),
    (p_company_id, v_pipeline_id, 'Demo Scheduled', 'demo_scheduled', 'demo_scheduled', 3, 45),
    (p_company_id, v_pipeline_id, 'Demo Completed', 'demo_completed', 'demo_completed', 4, 50),
    (p_company_id, v_pipeline_id, 'Proposal Sent', 'proposal_sent', 'proposal_sent', 5, 60),
    (p_company_id, v_pipeline_id, 'Negotiation', 'negotiation', 'negotiation', 6, 75),
    (p_company_id, v_pipeline_id, 'Won', 'won', 'won', 7, 100),
    (p_company_id, v_pipeline_id, 'Lost', 'lost', 'lost', 8, 0),
    (p_company_id, v_pipeline_id, 'Converted', 'converted', 'converted', 9, 100);

  return v_pipeline_id;
end;
$$;

comment on function public.lead_platform_ensure_default_pipeline(uuid) is
  'Ensures default lead pipeline including demo_completed between demo_scheduled and proposal_sent.';

-- ---------------------------------------------------------------------------
-- B. Canonical commercial product scope on opportunities
-- ---------------------------------------------------------------------------
alter table public.opportunities
  add column if not exists primary_product_id uuid
    references public.catalog_products(id) on delete set null;

comment on column public.opportunities.primary_product_id is
  'Canonical commercial-scope product/service (catalog_products.id). Defines uniqueness for open opportunities with a customer; not inferred from arbitrary first line item at query time.';

create index if not exists idx_opportunities_primary_product
  on public.opportunities (company_id, primary_product_id)
  where deleted_at is null and primary_product_id is not null;

-- Backfill primary_product_id only from explicit product-interest metadata or a single line item.
-- Multi-line opportunities without metadata are left null (not guessed).
update public.opportunities o
set primary_product_id = interest.product_uuid
from (
  select
    o2.id as opportunity_id,
    (o2.metadata->'productInterest'->>'productId')::uuid as product_uuid
  from public.opportunities o2
  where o2.primary_product_id is null
    and o2.deleted_at is null
    and nullif(o2.metadata->'productInterest'->>'productId', '') is not null
    and (o2.metadata->'productInterest'->>'productId') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
) interest
where o.id = interest.opportunity_id
  and exists (
    select 1 from public.catalog_products p
    where p.id = interest.product_uuid and p.company_id = o.company_id
  );

update public.opportunities o
set primary_product_id = only_line.product_id
from (
  select li.opportunity_id, min(li.product_id::text)::uuid as product_id
  from public.opportunity_line_items li
  where li.deleted_at is null
  group by li.opportunity_id
  having count(*) = 1
) only_line
where o.id = only_line.opportunity_id
  and o.primary_product_id is null
  and o.deleted_at is null;

-- ---------------------------------------------------------------------------
-- C. Uniqueness: one open opp per company + customer + primary_product
-- ---------------------------------------------------------------------------
do $$
declare
  conflict_count int;
  sample text;
begin
  select count(*)::int, string_agg(format('%s/%s/%s=%s', company_id, customer_id, primary_product_id, n), '; ')
  into conflict_count, sample
  from (
    select company_id, customer_id, primary_product_id, count(*)::int as n
    from public.opportunities
    where deleted_at is null
      and won_at is null
      and lost_at is null
      and customer_id is not null
      and primary_product_id is not null
    group by company_id, customer_id, primary_product_id
    having count(*) > 1
    limit 20
  ) dups;

  if coalesce(conflict_count, 0) > 0 then
    raise exception
      'Cannot create opportunities_one_open_per_customer_product_idx: % conflicting open groups. Resolve manually (do not auto-merge). Sample: %',
      conflict_count,
      coalesce(sample, '');
  end if;
end $$;

create unique index if not exists opportunities_one_open_per_customer_product_idx
  on public.opportunities (company_id, customer_id, primary_product_id)
  where deleted_at is null
    and won_at is null
    and lost_at is null
    and customer_id is not null
    and primary_product_id is not null;

comment on index public.opportunities_one_open_per_customer_product_idx is
  'At most one open Opportunity per company + customer + canonical primary_product_id. Soft-deleted and Won/Lost excluded. Rows missing customer_id or primary_product_id are unconstrained by this index.';
