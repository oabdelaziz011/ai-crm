-- Allow service-role webhook paths to schedule booking reminders without
-- relying solely on RLS bypass (and keep authenticated tenant policies intact).

drop policy if exists comm_reminder_schedules_select on public.communication_reminder_schedules;
create policy comm_reminder_schedules_select on public.communication_reminder_schedules for select
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (public.is_super_admin() or company_id = public.current_company_id())
    )
  );

drop policy if exists comm_reminder_schedules_write on public.communication_reminder_schedules;
create policy comm_reminder_schedules_write on public.communication_reminder_schedules for all
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (public.is_super_admin() or company_id = public.current_company_id())
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (public.is_super_admin() or company_id = public.current_company_id())
    )
  );

drop policy if exists communication_audit_insert on public.communication_audit_log;
create policy communication_audit_insert on public.communication_audit_log for insert
  with check (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (public.is_super_admin() or company_id = public.current_company_id())
    )
  );

drop policy if exists communication_audit_select on public.communication_audit_log;
create policy communication_audit_select on public.communication_audit_log for select
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (public.is_super_admin() or company_id = public.current_company_id())
    )
  );

grant select, insert, update, delete on public.communication_reminder_schedules to service_role;
grant select, insert on public.communication_audit_log to service_role;
