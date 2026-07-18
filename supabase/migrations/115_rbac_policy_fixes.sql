-- Fix policy names from 114 bulk migration (webhook_events, provider health)

drop policy if exists webhook_events_write on public.webhook_events;
drop policy if exists webhook_events_select on public.webhook_events;
drop policy if exists webhook_events_insert on public.webhook_events;
drop policy if exists webhook_events_update on public.webhook_events;
drop policy if exists webhook_events_delete on public.webhook_events;

create policy webhook_events_select on public.webhook_events for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.webhooks.view'))
);

create policy webhook_events_write on public.webhook_events for all using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.webhooks.manage'))
)
with check (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.webhooks.manage'))
);

drop policy if exists payment_provider_health_select on public.payment_provider_health_snapshots;
drop policy if exists payment_provider_health_snapshots_select on public.payment_provider_health_snapshots;

create policy payment_provider_health_select on public.payment_provider_health_snapshots for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.health.view'))
);

drop policy if exists company_payment_methods_insert on public.company_payment_methods;
create policy company_payment_methods_insert on public.company_payment_methods for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.edit')
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.payment_method.manage_own')
    )
  )
);

drop policy if exists company_payment_methods_update on public.company_payment_methods;
create policy company_payment_methods_update on public.company_payment_methods for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.edit')
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.payment_method.manage_own')
    )
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.edit')
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.payment_method.manage_own')
    )
  )
);

-- Grant platform billing permissions to super-admin via existing bypass; seed finance/support roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.id = 'd0000030-0001-4001-8001-000000000003'::uuid
  and p.code in ('billing.health.view', 'billing.view_reports', 'billing.webhooks.view')
on conflict do nothing;
