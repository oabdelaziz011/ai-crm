-- ============================================================
-- 340 — Profiles SELECT for handoff desk colleagues
--
-- Omnichannel Assign / @mentions use `profiles` via useProfiles().
-- Human Handoff Agent has handoff.assign but not users.view, so
-- RLS only returned the caller's own row (profiles_owner_select).
-- That made the Assign User tab show a single employee.
--
-- Allow same-company colleague SELECT for desk handoff permissions
-- without granting full users.view / Employees admin access.
-- ============================================================

drop policy if exists profiles_handoff_colleague_select on public.profiles;

create policy profiles_handoff_colleague_select
  on public.profiles
  for select
  using (
    auth.role() = 'authenticated'
    and company_id is not null
    and company_id = internal.current_company_id()
    and coalesce(is_active, true)
    and (
      internal.user_has_permission('handoff.view')
      or internal.user_has_permission('handoff.assign')
      or internal.user_has_permission('handoff.transfer')
      or internal.user_has_permission('handoff.presence')
    )
  );

comment on policy profiles_handoff_colleague_select on public.profiles is
  'Desk agents with handoff view/assign/transfer/presence may list active same-company colleagues for assignment and mentions.';
