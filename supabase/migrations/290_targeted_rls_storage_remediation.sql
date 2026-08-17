-- ============================================================
-- 290 — Targeted RLS/storage remediation (notifications, portal
--       analytics, public bucket listing)
--
-- 1) Drop permissive TRUE authenticated policies on notifications
--    that OR-bypass company-scoped policies.
-- 2) Allow same-company INSERT for legitimate product notification
--    creators (ticket/lead/handoff bridges) without cross-tenant TRUE.
-- 3) Constrain portal_analytics_events INSERT (company exists +
--    allowed event_type) while keeping anonymous portal tracking.
-- 4) Drop broad public SELECT policies on public storage buckets
--    avatars / company-branding (listing). Public object URLs remain
--    valid because buckets stay public.
--
-- Does NOT touch HIBP / Auth config / DEFINER architecture / 282–289.
-- ============================================================

-- ── 1. notifications: remove cross-tenant TRUE policies ─────────
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;

-- Same-company INSERT for authenticated product flows (createNotification).
-- Company-admin insert policy (notifications_insert_admins) remains as a
-- tighter overlapping permissive policy.
drop policy if exists notifications_insert_company on public.notifications;
create policy notifications_insert_company
  on public.notifications
  for insert
  with check (
    auth.role() = 'authenticated'
    and (
      internal.is_super_admin()
      or company_id = internal.current_company_id()
    )
  );

-- Ensure company-scoped companions still exist (idempotent recreate).
drop policy if exists notifications_select_company on public.notifications;
create policy notifications_select_company
  on public.notifications
  for select
  using (
    auth.role() = 'authenticated'
    and (
      internal.is_super_admin()
      or company_id = internal.current_company_id()
    )
  );

drop policy if exists notifications_update_company on public.notifications;
create policy notifications_update_company
  on public.notifications
  for update
  using (
    auth.role() = 'authenticated'
    and (
      internal.is_super_admin()
      or company_id = internal.current_company_id()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      internal.is_super_admin()
      or company_id = internal.current_company_id()
    )
  );

drop policy if exists notifications_delete_company on public.notifications;
create policy notifications_delete_company
  on public.notifications
  for delete
  using (
    auth.role() = 'authenticated'
    and (
      internal.is_super_admin()
      or company_id = internal.current_company_id()
    )
  );

drop policy if exists notifications_insert_admins on public.notifications;
create policy notifications_insert_admins
  on public.notifications
  for insert
  with check (
    auth.role() = 'authenticated'
    and (
      internal.is_super_admin()
      or (
        company_id = internal.current_company_id()
        and internal.is_company_admin()
      )
    )
  );

-- ── 2. portal_analytics_events: constrain anonymous INSERT ───────
drop policy if exists portal_analytics_insert on public.portal_analytics_events;
create policy portal_analytics_insert
  on public.portal_analytics_events
  for insert
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = company_id
    )
    and event_type = any (
      array[
        'portal_visit'::text,
        'booking_completed'::text,
        'booking_cancelled'::text
      ]
    )
  );

-- Staff SELECT remains company-scoped (reaffirm with internal helpers).
drop policy if exists portal_analytics_staff on public.portal_analytics_events;
create policy portal_analytics_staff
  on public.portal_analytics_events
  for select
  using (
    auth.role() = 'authenticated'
    and (
      internal.is_super_admin()
      or company_id = internal.current_company_id()
    )
  );

-- ── 3/4. Public buckets: remove listing SELECT policies ─────────
-- Public object GET via /object/public/... does not require SELECT RLS.
drop policy if exists avatars_storage_select on storage.objects;
drop policy if exists "avatars_storage_select" on storage.objects;

drop policy if exists company_branding_storage_select on storage.objects;
drop policy if exists "company_branding_storage_select" on storage.objects;
