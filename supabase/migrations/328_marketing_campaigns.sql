-- Marketing Campaigns foundation (V1a WhatsApp-first).
-- Additive only. Channel support is WhatsApp-only (no other campaign channels).
-- Do NOT apply via supabase db push without explicit approval.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.permissions (code, category, module, action, description)
values
  ('campaigns.view', 'Campaigns', 'Campaigns', 'View', 'View marketing campaigns and results'),
  ('campaigns.create', 'Campaigns', 'Campaigns', 'Create', 'Create and edit campaign drafts'),
  ('campaigns.send', 'Campaigns', 'Campaigns', 'Send', 'Execute / send marketing campaigns')
on conflict (code) do update
set category = excluded.category,
    module = excluded.module,
    action = excluded.action,
    description = excluded.description,
    updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'campaigns.view'),
    ('admin', 'campaigns.create'),
    ('admin', 'campaigns.send'),
    ('manager', 'campaigns.view'),
    ('manager', 'campaigns.create'),
    ('manager', 'campaigns.send'),
    ('employee', 'campaigns.view')
) as v(template_key, permission_code)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- marketing_campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'running', 'completed', 'failed', 'cancelled')),
  audience_type text not null
    check (audience_type in ('all', 'filtered', 'manual')),
  audience_definition jsonb not null default '{}'::jsonb,
  channels text[] not null default array['whatsapp']::text[]
    check (
      cardinality(channels) > 0
      and channels <@ array['whatsapp']::text[]
    ),
  content_definition jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  total_recipients_count integer not null default 0,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint marketing_campaigns_idempotency_unique
    unique (company_id, idempotency_key)
);

create index if not exists idx_marketing_campaigns_company_created
  on public.marketing_campaigns(company_id, created_at desc);

create index if not exists idx_marketing_campaigns_company_status
  on public.marketing_campaigns(company_id, status);

drop trigger if exists marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger marketing_campaigns_updated_at
  before update on public.marketing_campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- marketing_campaign_recipients
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references public.marketing_campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  channel text not null check (channel = 'whatsapp'),
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'sent', 'failed', 'skipped')),
  notification_queue_id uuid,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_recipients_unique_target
    unique (campaign_id, customer_id, channel)
);

create index if not exists idx_marketing_campaign_recipients_campaign
  on public.marketing_campaign_recipients(campaign_id);

create index if not exists idx_marketing_campaign_recipients_company_status
  on public.marketing_campaign_recipients(company_id, status);

create index if not exists idx_marketing_campaign_recipients_queue
  on public.marketing_campaign_recipients(notification_queue_id)
  where notification_queue_id is not null;

drop trigger if exists marketing_campaign_recipients_updated_at
  on public.marketing_campaign_recipients;
create trigger marketing_campaign_recipients_updated_at
  before update on public.marketing_campaign_recipients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_recipients enable row level security;

drop policy if exists marketing_campaigns_select on public.marketing_campaigns;
create policy marketing_campaigns_select
  on public.marketing_campaigns for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or public.company_has_permission(company_id, 'campaigns.view')
    )
  );

drop policy if exists marketing_campaigns_insert on public.marketing_campaigns;
create policy marketing_campaigns_insert
  on public.marketing_campaigns for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.company_has_permission(company_id, 'campaigns.create')
        and company_id = public.current_company_id()
      )
    )
  );

drop policy if exists marketing_campaigns_update on public.marketing_campaigns;
create policy marketing_campaigns_update
  on public.marketing_campaigns for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and (
          public.company_has_permission(company_id, 'campaigns.create')
          or public.company_has_permission(company_id, 'campaigns.send')
        )
      )
    )
  );

drop policy if exists marketing_campaign_recipients_select
  on public.marketing_campaign_recipients;
create policy marketing_campaign_recipients_select
  on public.marketing_campaign_recipients for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or public.company_has_permission(company_id, 'campaigns.view')
    )
  );

drop policy if exists marketing_campaign_recipients_insert
  on public.marketing_campaign_recipients;
create policy marketing_campaign_recipients_insert
  on public.marketing_campaign_recipients for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and (
          public.company_has_permission(company_id, 'campaigns.create')
          or public.company_has_permission(company_id, 'campaigns.send')
        )
      )
    )
  );

drop policy if exists marketing_campaign_recipients_update
  on public.marketing_campaign_recipients;
create policy marketing_campaign_recipients_update
  on public.marketing_campaign_recipients for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and (
          public.company_has_permission(company_id, 'campaigns.create')
          or public.company_has_permission(company_id, 'campaigns.send')
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Audit (reuse audit_logs; dedicated trigger fn so write_audit_log stays intact)
-- ---------------------------------------------------------------------------
create or replace function public.marketing_campaign_write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id text;
  v_company_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;
  v_company_id := coalesce(new.company_id, old.company_id, public.current_company_id());

  if TG_TABLE_NAME = 'marketing_campaigns' then
    if TG_OP = 'DELETE' then
      v_metadata := jsonb_build_object(
        'source', 'marketing_campaign',
        'event', 'campaign_deleted',
        'campaign_id', old.id,
        'name', old.name,
        'status', old.status,
        'audience_type', old.audience_type,
        'channels', old.channels,
        'idempotency_key', old.idempotency_key,
        'created_by', old.created_by
      );
    else
      v_metadata := jsonb_build_object(
        'source', 'marketing_campaign',
        'event', case when TG_OP = 'INSERT' then 'campaign_created' else 'campaign_updated' end,
        'campaign_id', new.id,
        'name', new.name,
        'status', new.status,
        'audience_type', new.audience_type,
        'channels', new.channels,
        'idempotency_key', new.idempotency_key,
        'total_recipients_count', new.total_recipients_count,
        'queued_count', new.queued_count,
        'sent_count', new.sent_count,
        'failed_count', new.failed_count,
        'skipped_count', new.skipped_count,
        'created_by', new.created_by
      );
    end if;
  elsif TG_TABLE_NAME = 'marketing_campaign_recipients' then
    if TG_OP = 'DELETE' then
      v_metadata := jsonb_build_object(
        'source', 'marketing_campaign',
        'event', 'recipient_deleted',
        'campaign_id', old.campaign_id,
        'customer_id', old.customer_id,
        'channel', old.channel,
        'status', old.status
      );
    else
      v_metadata := jsonb_build_object(
        'source', 'marketing_campaign',
        'event', case when TG_OP = 'INSERT' then 'recipient_created' else 'recipient_updated' end,
        'campaign_id', new.campaign_id,
        'customer_id', new.customer_id,
        'channel', new.channel,
        'status', new.status,
        'notification_queue_id', new.notification_queue_id,
        'provider_message_id', new.provider_message_id,
        'error_message', left(coalesce(new.error_message, ''), 500)
      );
    end if;
  end if;

  insert into public.audit_logs (
    user_id,
    company_id,
    action,
    entity,
    entity_id,
    ip_address,
    metadata,
    created_at
  )
  values (
    auth.uid(),
    v_company_id,
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    public.request_ip_address(),
    v_metadata,
    now()
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_marketing_campaigns on public.marketing_campaigns;
create trigger trg_audit_marketing_campaigns
  after insert or update or delete on public.marketing_campaigns
  for each row execute procedure public.marketing_campaign_write_audit();

drop trigger if exists trg_audit_marketing_campaign_recipients
  on public.marketing_campaign_recipients;
create trigger trg_audit_marketing_campaign_recipients
  after insert or update or delete on public.marketing_campaign_recipients
  for each row execute procedure public.marketing_campaign_write_audit();

comment on table public.marketing_campaigns is
  'Company-scoped outbound marketing campaigns (V1a WhatsApp-first).';
comment on table public.marketing_campaign_recipients is
  'Per-customer/channel campaign delivery outcomes; queued != sent.';
comment on function public.marketing_campaign_write_audit() is
  'Writes compact marketing campaign audit rows into public.audit_logs.';
