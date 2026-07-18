-- ============================================================
-- Vault OS – RBAC
-- ============================================================

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text,
  module text,
  action text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.user_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, permission_id)
);

alter table public.roles
  add column if not exists company_id uuid,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists is_system boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.permissions
  add column if not exists code text,
  add column if not exists category text,
  add column if not exists module text,
  add column if not exists action text,
  add column if not exists description text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.user_roles
  add column if not exists created_at timestamptz default now();

alter table public.role_permissions
  add column if not exists created_at timestamptz default now();

alter table public.user_permissions
  add column if not exists created_at timestamptz default now();

update public.roles set is_system = false where is_system is null;
update public.roles set created_at = now() where created_at is null;
update public.roles set updated_at = now() where updated_at is null;
update public.permissions set created_at = now() where created_at is null;
update public.permissions set updated_at = now() where updated_at is null;
update public.user_roles set created_at = now() where created_at is null;
update public.role_permissions set created_at = now() where created_at is null;
update public.user_permissions set created_at = now() where created_at is null;

create index if not exists idx_roles_company_id on public.roles(company_id);
create index if not exists idx_roles_name on public.roles(name);
create index if not exists idx_permissions_code on public.permissions(code);
create index if not exists idx_permissions_module on public.permissions(module);
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role_id on public.user_roles(role_id);
create index if not exists idx_role_permissions_role_id on public.role_permissions(role_id);
create index if not exists idx_role_permissions_permission_id on public.role_permissions(permission_id);
create index if not exists idx_user_permissions_user_id on public.user_permissions(user_id);
create index if not exists idx_user_permissions_permission_id on public.user_permissions(permission_id);

drop trigger if exists roles_updated_at on public.roles;
create trigger roles_updated_at
  before update on public.roles
  for each row execute procedure public.set_updated_at();

drop trigger if exists permissions_updated_at on public.permissions;
create trigger permissions_updated_at
  before update on public.permissions
  for each row execute procedure public.set_updated_at();

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and (
        r.company_id = public.current_company_id()
        or r.company_id is null
      )
      and lower(coalesce(r.name, '')) in ('admin', 'company admin', 'company_admin', 'owner')
  );
$$;

insert into public.permissions (code, category, module, action, description)
values
  ('customers.view', 'Customers', 'Customers', 'View', 'View customers'),
  ('customers.create', 'Customers', 'Customers', 'Create', 'Create customers'),
  ('customers.edit', 'Customers', 'Customers', 'Edit', 'Edit customers'),
  ('customers.delete', 'Customers', 'Customers', 'Delete', 'Delete customers'),
  ('bookings.view', 'Bookings', 'Bookings', 'View', 'View bookings'),
  ('bookings.create', 'Bookings', 'Bookings', 'Create', 'Create bookings'),
  ('bookings.edit', 'Bookings', 'Bookings', 'Edit', 'Edit bookings'),
  ('bookings.delete', 'Bookings', 'Bookings', 'Delete', 'Delete bookings'),
  ('invoices.view', 'Invoices', 'Invoices', 'View', 'View invoices'),
  ('invoices.create', 'Invoices', 'Invoices', 'Create', 'Create invoices'),
  ('invoices.edit', 'Invoices', 'Invoices', 'Edit', 'Edit invoices'),
  ('invoices.delete', 'Invoices', 'Invoices', 'Delete', 'Delete invoices'),
  ('companies.view', 'Administration', 'Companies', 'View', 'View companies'),
  ('companies.create', 'Administration', 'Companies', 'Create', 'Create companies'),
  ('companies.edit', 'Administration', 'Companies', 'Edit', 'Edit companies'),
  ('companies.delete', 'Administration', 'Companies', 'Delete', 'Delete companies'),
  ('subscriptions.view', 'Administration', 'Subscriptions', 'View', 'View subscriptions'),
  ('subscriptions.edit', 'Administration', 'Subscriptions', 'Edit', 'Edit subscriptions'),
  ('audit_logs.view', 'Administration', 'Audit Logs', 'View', 'View audit logs'),
  ('reports.view', 'Reports', 'Reports', 'View', 'View reports'),
  ('settings.view', 'Settings', 'Settings', 'View', 'View settings'),
  ('settings.edit', 'Settings', 'Settings', 'Edit', 'Edit settings'),
  ('ai_chat.view', 'AI Chat', 'AI Chat', 'View', 'View AI chat'),
  ('ai_chat.use', 'AI Chat', 'AI Chat', 'Use', 'Use AI chat'),
  ('whatsapp.view', 'WhatsApp Automation', 'WhatsApp Automation', 'View', 'View WhatsApp automation'),
  ('whatsapp.run', 'WhatsApp Automation', 'WhatsApp Automation', 'Run', 'Run WhatsApp automation'),
  ('users.view', 'Administration', 'Users', 'View', 'View users'),
  ('users.edit', 'Administration', 'Users', 'Edit', 'Edit users'),
  ('roles.view', 'Administration', 'Roles', 'View', 'View roles'),
  ('roles.create', 'Administration', 'Roles', 'Create', 'Create roles'),
  ('roles.edit', 'Administration', 'Roles', 'Edit', 'Edit roles'),
  ('roles.delete', 'Administration', 'Roles', 'Delete', 'Delete roles'),
  ('permissions.view', 'Administration', 'User Permissions', 'View', 'View permissions'),
  ('permissions.edit', 'Administration', 'User Permissions', 'Edit', 'Edit permissions')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;

-- Profiles admin policies

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select
  on public.profiles for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and company_id = public.current_company_id()
      )
    )
  );

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
  on public.profiles for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and company_id = public.current_company_id()
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and company_id = public.current_company_id()
        and is_super_admin = false
      )
    )
  );

-- Roles

drop policy if exists roles_select_policy on public.roles;
create policy roles_select_policy
  on public.roles for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
      or company_id is null
    )
  );

drop policy if exists roles_insert_policy on public.roles;
create policy roles_insert_policy
  on public.roles for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and company_id = public.current_company_id()
      )
    )
  );

drop policy if exists roles_update_policy on public.roles;
create policy roles_update_policy
  on public.roles for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and company_id = public.current_company_id()
        and is_system = false
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and company_id = public.current_company_id()
        and is_system = false
      )
    )
  );

drop policy if exists roles_delete_policy on public.roles;
create policy roles_delete_policy
  on public.roles for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and company_id = public.current_company_id()
        and is_system = false
      )
    )
  );

-- Permissions

drop policy if exists permissions_select_policy on public.permissions;
create policy permissions_select_policy
  on public.permissions for select
  using (auth.role() = 'authenticated');

drop policy if exists permissions_insert_policy on public.permissions;
create policy permissions_insert_policy
  on public.permissions for insert
  with check (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists permissions_update_policy on public.permissions;
create policy permissions_update_policy
  on public.permissions for update
  using (auth.role() = 'authenticated' and public.is_super_admin())
  with check (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists permissions_delete_policy on public.permissions;
create policy permissions_delete_policy
  on public.permissions for delete
  using (auth.role() = 'authenticated' and public.is_super_admin());

-- User roles

drop policy if exists user_roles_select_policy on public.user_roles;
create policy user_roles_select_policy
  on public.user_roles for select
  using (
    auth.role() = 'authenticated'
    and (
      user_id = auth.uid()
      or public.is_super_admin()
      or (
        public.is_company_admin()
        and exists (
          select 1
          from public.roles r
          where r.id = user_roles.role_id
            and r.company_id = public.current_company_id()
        )
      )
    )
  );

drop policy if exists user_roles_insert_policy on public.user_roles;
create policy user_roles_insert_policy
  on public.user_roles for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and exists (
          select 1
          from public.roles r
          where r.id = user_roles.role_id
            and r.company_id = public.current_company_id()
        )
      )
    )
  );

drop policy if exists user_roles_delete_policy on public.user_roles;
create policy user_roles_delete_policy
  on public.user_roles for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and exists (
          select 1
          from public.roles r
          where r.id = user_roles.role_id
            and r.company_id = public.current_company_id()
        )
      )
    )
  );

-- Role permissions

drop policy if exists role_permissions_select_policy on public.role_permissions;
create policy role_permissions_select_policy
  on public.role_permissions for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.roles r
      where r.id = role_permissions.role_id
        and (
          public.is_super_admin()
          or r.company_id = public.current_company_id()
          or r.company_id is null
        )
    )
  );

drop policy if exists role_permissions_insert_policy on public.role_permissions;
create policy role_permissions_insert_policy
  on public.role_permissions for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.roles r
      where r.id = role_permissions.role_id
        and (
          public.is_super_admin()
          or (
            public.is_company_admin()
            and r.company_id = public.current_company_id()
            and r.is_system = false
          )
        )
    )
  );

drop policy if exists role_permissions_delete_policy on public.role_permissions;
create policy role_permissions_delete_policy
  on public.role_permissions for delete
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.roles r
      where r.id = role_permissions.role_id
        and (
          public.is_super_admin()
          or (
            public.is_company_admin()
            and r.company_id = public.current_company_id()
            and r.is_system = false
          )
        )
    )
  );

-- User permissions

drop policy if exists user_permissions_select_policy on public.user_permissions;
create policy user_permissions_select_policy
  on public.user_permissions for select
  using (
    auth.role() = 'authenticated'
    and (
      user_id = auth.uid()
      or public.is_super_admin()
      or (
        public.is_company_admin()
        and exists (
          select 1
          from public.profiles p
          where (p.id = user_permissions.user_id or p.user_id = user_permissions.user_id)
            and p.company_id = public.current_company_id()
        )
      )
    )
  );

drop policy if exists user_permissions_insert_policy on public.user_permissions;
create policy user_permissions_insert_policy
  on public.user_permissions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and exists (
          select 1
          from public.profiles p
          where (p.id = user_permissions.user_id or p.user_id = user_permissions.user_id)
            and p.company_id = public.current_company_id()
        )
      )
    )
  );

drop policy if exists user_permissions_delete_policy on public.user_permissions;
create policy user_permissions_delete_policy
  on public.user_permissions for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.is_company_admin()
        and exists (
          select 1
          from public.profiles p
          where (p.id = user_permissions.user_id or p.user_id = user_permissions.user_id)
            and p.company_id = public.current_company_id()
        )
      )
    )
  );
