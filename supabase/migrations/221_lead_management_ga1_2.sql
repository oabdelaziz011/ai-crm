-- GA-1.2 — Enterprise Lead Management permissions

insert into public.permissions (code, category, module, action, description)
values
  ('leads.delete', 'Leads', 'Leads', 'Delete', 'Archive and delete leads'),
  ('leads.export', 'Leads', 'Leads', 'Export', 'Export lead data'),
  ('leads.pipeline.manage', 'Leads', 'Lead Pipeline', 'Manage', 'Configure pipeline stages and transitions')
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
    ('admin', 'leads.delete'),
    ('admin', 'leads.export'),
    ('admin', 'leads.pipeline.manage'),
    ('manager', 'leads.delete'),
    ('manager', 'leads.export'),
    ('manager', 'leads.pipeline.manage')
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
  and trp.permission_code in ('leads.delete', 'leads.export', 'leads.pipeline.manage')
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

do $$
begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lead_stages;
exception when duplicate_object then null;
end $$;
