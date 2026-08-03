-- GA-1.2 — Enterprise Lead Management permissions

insert into public.permissions (code, name, description, category)
select v.code, v.name, v.description, 'leads'
from (values
  ('leads.delete', 'Delete Leads', 'Archive and delete leads'),
  ('leads.export', 'Export Leads', 'Export lead data'),
  ('leads.pipeline.manage', 'Manage Lead Pipeline', 'Configure pipeline stages and transitions')
) as v(code, name, description)
where not exists (select 1 from public.permissions p where p.code = v.code);

insert into public.role_permissions (role_name, permission_code)
select v.role_name, v.code
from (values
  ('admin', 'leads.delete'),
  ('admin', 'leads.export'),
  ('admin', 'leads.pipeline.manage'),
  ('manager', 'leads.delete'),
  ('manager', 'leads.export'),
  ('manager', 'leads.pipeline.manage')
) as v(role_name, code)
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_name = v.role_name and rp.permission_code = v.code
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
