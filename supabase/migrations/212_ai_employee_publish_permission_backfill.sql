-- Backfill agents.publish and agents.rollback for existing company admin roles (Sprint 6.8.4 gap).

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in ('agents.publish', 'agents.rollback')
where r.company_id is not null
  and r.is_system = true
  and (
    r.template_key = 'admin'
    or r.name ilike '%admin%'
    or r.description ilike '%administrator%'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
