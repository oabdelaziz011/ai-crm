-- GA-1.1 — Universal Entity Foundation (CRM Core)
-- Universal tables for contacts, files, tags, custom fields, activities — all entity types.

-- ── Helper: validate entity_type against registry (extensible via insert) ──

create table if not exists public.entity_type_registry (
  code text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.entity_type_registry (code, label) values
  ('customer', 'Customer'),
  ('lead', 'Lead'),
  ('company', 'Company'),
  ('employee', 'Employee'),
  ('supplier', 'Supplier'),
  ('project', 'Project'),
  ('asset', 'Asset'),
  ('booking', 'Booking'),
  ('invoice', 'Invoice'),
  ('ticket', 'Ticket'),
  ('knowledge', 'Knowledge')
on conflict (code) do nothing;

-- ── entity_contacts ────────────────────────────────────────────────────────

create table if not exists public.entity_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  contact_type text not null default 'primary'
    check (contact_type in ('primary', 'billing', 'technical', 'emergency', 'decision_maker', 'assistant', 'other')),
  display_name text not null,
  emails jsonb not null default '[]'::jsonb,
  phones jsonb not null default '[]'::jsonb,
  whatsapp text,
  preferred_language text,
  preferred_channel text,
  notes text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  is_primary boolean not null default false,
  search_text text generated always as (
    lower(coalesce(display_name, '') || ' ' || coalesce(whatsapp, '') || ' ' || coalesce(notes, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_entity_contacts_tenant_entity
  on public.entity_contacts(tenant_id, entity_type, entity_id)
  where deleted_at is null;

create index if not exists idx_entity_contacts_search
  on public.entity_contacts(tenant_id, search_text)
  where deleted_at is null;

-- ── entity_files ───────────────────────────────────────────────────────────

create table if not exists public.entity_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  category text,
  storage_provider text not null default 'supabase',
  storage_path text not null,
  preview_metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  permissions jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_entity_files_tenant_entity
  on public.entity_files(tenant_id, entity_type, entity_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_entity_files_name
  on public.entity_files(tenant_id, lower(file_name))
  where deleted_at is null;

-- ── entity_tags (definitions) ──────────────────────────────────────────────

create table if not exists public.entity_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text,
  icon text,
  category text,
  description text,
  is_system boolean not null default false,
  search_text text generated always as (lower(coalesce(name, '') || ' ' || coalesce(description, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, name)
);

create index if not exists idx_entity_tags_tenant
  on public.entity_tags(tenant_id)
  where deleted_at is null;

-- ── entity_tag_assignments ─────────────────────────────────────────────────

create table if not exists public.entity_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  tag_id uuid not null references public.entity_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, entity_type, entity_id, tag_id)
);

create index if not exists idx_entity_tag_assignments_entity
  on public.entity_tag_assignments(tenant_id, entity_type, entity_id)
  where deleted_at is null;

-- ── entity_custom_fields (definitions) ─────────────────────────────────────

create table if not exists public.entity_custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in (
    'text', 'textarea', 'number', 'currency', 'boolean', 'date', 'datetime',
    'dropdown', 'multi_select', 'lookup', 'formula', 'json'
  )),
  options jsonb not null default '{}'::jsonb,
  validation_rules jsonb not null default '{}'::jsonb,
  visibility_rules jsonb not null default '{}'::jsonb,
  required_rules jsonb not null default '{}'::jsonb,
  role_permissions jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, entity_type, field_key)
);

create index if not exists idx_entity_custom_fields_tenant_type
  on public.entity_custom_fields(tenant_id, entity_type, sort_order)
  where deleted_at is null;

-- ── entity_custom_field_values ───────────────────────────────────────────────

create table if not exists public.entity_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  field_id uuid not null references public.entity_custom_fields(id) on delete cascade,
  value_text text,
  value_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, entity_type, entity_id, field_id)
);

create index if not exists idx_entity_custom_field_values_entity
  on public.entity_custom_field_values(tenant_id, entity_type, entity_id)
  where deleted_at is null;

-- ── entity_activities ──────────────────────────────────────────────────────

create table if not exists public.entity_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  activity_type text not null check (activity_type in (
    'call', 'meeting', 'booking', 'invoice', 'payment', 'email', 'whatsapp', 'sms',
    'task', 'workflow', 'ai', 'manual_note', 'timeline'
  )),
  subject text not null,
  body text,
  outcome text,
  duration_seconds integer,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  related_entity_type text references public.entity_type_registry(code),
  related_entity_id uuid,
  attachments jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_entity_activities_entity_occurred
  on public.entity_activities(tenant_id, entity_type, entity_id, occurred_at desc)
  where deleted_at is null;

create index if not exists idx_entity_activities_type
  on public.entity_activities(tenant_id, activity_type, occurred_at desc)
  where deleted_at is null;

-- ── updated_at triggers ────────────────────────────────────────────────────

create or replace function public.trg_entity_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'entity_contacts', 'entity_files', 'entity_tags', 'entity_custom_fields',
    'entity_custom_field_values', 'entity_activities'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%s', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%s for each row execute function public.trg_entity_set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.entity_contacts enable row level security;
alter table public.entity_files enable row level security;
alter table public.entity_tags enable row level security;
alter table public.entity_tag_assignments enable row level security;
alter table public.entity_custom_fields enable row level security;
alter table public.entity_custom_field_values enable row level security;
alter table public.entity_activities enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'entity_contacts', 'entity_files', 'entity_tags', 'entity_tag_assignments',
    'entity_custom_fields', 'entity_custom_field_values', 'entity_activities'
  ] loop
    execute format('drop policy if exists %I_select on public.%I', tbl, tbl);
    execute format('drop policy if exists %I_insert on public.%I', tbl, tbl);
    execute format('drop policy if exists %I_update on public.%I', tbl, tbl);
    execute format('drop policy if exists %I_delete on public.%I', tbl, tbl);

    execute format(
      'create policy %I_select on public.%I for select to authenticated using (
        public.is_super_admin() or (tenant_id = public.current_company_id() and deleted_at is null)
      )', tbl, tbl
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (
        public.is_super_admin() or tenant_id = public.current_company_id()
      )', tbl, tbl
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (
        public.is_super_admin() or tenant_id = public.current_company_id()
      ) with check (
        public.is_super_admin() or tenant_id = public.current_company_id()
      )', tbl, tbl
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (
        public.is_super_admin() or tenant_id = public.current_company_id()
      )', tbl, tbl
    );
  end loop;
end $$;

-- tag_assignments uses deleted_at soft delete
drop policy if exists entity_tag_assignments_select on public.entity_tag_assignments;
create policy entity_tag_assignments_select on public.entity_tag_assignments for select to authenticated using (
  public.is_super_admin() or (tenant_id = public.current_company_id() and deleted_at is null)
);

-- ── Permissions ────────────────────────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('entity.contacts.read', 'Entity', 'Entity Contacts', 'Read', 'View contacts on any entity'),
  ('entity.contacts.write', 'Entity', 'Entity Contacts', 'Write', 'Create and update entity contacts'),
  ('entity.contacts.delete', 'Entity', 'Entity Contacts', 'Delete', 'Archive entity contacts'),
  ('entity.files.read', 'Entity', 'Entity Files', 'Read', 'View files on any entity'),
  ('entity.files.write', 'Entity', 'Entity Files', 'Write', 'Upload entity files'),
  ('entity.files.delete', 'Entity', 'Entity Files', 'Delete', 'Archive entity files'),
  ('entity.tags.read', 'Entity', 'Entity Tags', 'Read', 'View tags and assignments'),
  ('entity.tags.write', 'Entity', 'Entity Tags', 'Write', 'Manage tags and assignments'),
  ('entity.activities.read', 'Entity', 'Entity Activities', 'Read', 'View entity activity timeline'),
  ('entity.activities.write', 'Entity', 'Entity Activities', 'Write', 'Log entity activities'),
  ('entity.custom_fields.read', 'Entity', 'Custom Fields', 'Read', 'View custom field definitions and values'),
  ('entity.custom_fields.write', 'Entity', 'Custom Fields', 'Write', 'Manage custom field definitions and values')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'entity.contacts.read'),
    ('admin', 'entity.contacts.write'),
    ('admin', 'entity.contacts.delete'),
    ('admin', 'entity.files.read'),
    ('admin', 'entity.files.write'),
    ('admin', 'entity.files.delete'),
    ('admin', 'entity.tags.read'),
    ('admin', 'entity.tags.write'),
    ('admin', 'entity.activities.read'),
    ('admin', 'entity.activities.write'),
    ('admin', 'entity.custom_fields.read'),
    ('admin', 'entity.custom_fields.write'),
    ('manager', 'entity.contacts.read'),
    ('manager', 'entity.contacts.write'),
    ('manager', 'entity.files.read'),
    ('manager', 'entity.files.write'),
    ('manager', 'entity.tags.read'),
    ('manager', 'entity.tags.write'),
    ('manager', 'entity.activities.read'),
    ('manager', 'entity.activities.write'),
    ('manager', 'entity.custom_fields.read'),
    ('employee', 'entity.contacts.read'),
    ('employee', 'entity.files.read'),
    ('employee', 'entity.tags.read'),
    ('employee', 'entity.activities.read'),
    ('employee', 'entity.custom_fields.read')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
inner join public.permissions p
  on p.code = trp.permission_code
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and trp.permission_code like 'entity.%'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

-- ── Realtime publication ───────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.entity_contacts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.entity_files;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.entity_tag_assignments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.entity_activities;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.entity_custom_field_values;
exception when duplicate_object then null;
end $$;

comment on table public.entity_contacts is 'Universal contacts — attached to any entity via entity_type + entity_id';
