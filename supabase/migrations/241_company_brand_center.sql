-- Sprint 3.8 — Company Brand Center
-- Canonical company branding JSON + public asset bucket + save RPC (syncs legacy consumers).

alter table public.companies
  add column if not exists branding jsonb not null default '{}'::jsonb;

comment on column public.companies.branding is
  'Enterprise Brand Center payload: general, logos, colors, documents, email.';

-- Tenant members with branding permission may update logo + branding on their company.
drop policy if exists companies_member_branding_update on public.companies;
create policy companies_member_branding_update
  on public.companies for update
  using (
    auth.role() = 'authenticated'
    and id = public.current_company_id()
    and (
      public.user_has_permission('company.branding')
      or public.user_has_permission('settings.edit')
      or public.user_has_permission('company.update')
    )
  )
  with check (
    auth.role() = 'authenticated'
    and id = public.current_company_id()
    and (
      public.user_has_permission('company.branding')
      or public.user_has_permission('settings.edit')
      or public.user_has_permission('company.update')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-branding',
  'company-branding',
  true,
  5242880,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company_branding_storage_select" on storage.objects;
create policy "company_branding_storage_select"
on storage.objects for select
to public
using (bucket_id = 'company-branding');

drop policy if exists "company_branding_storage_insert" on storage.objects;
create policy "company_branding_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-branding'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
  and (
    public.is_super_admin()
    or public.user_has_permission('company.branding')
    or public.user_has_permission('settings.edit')
  )
);

drop policy if exists "company_branding_storage_update" on storage.objects;
create policy "company_branding_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'company-branding'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
  and (
    public.is_super_admin()
    or public.user_has_permission('company.branding')
    or public.user_has_permission('settings.edit')
  )
)
with check (
  bucket_id = 'company-branding'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "company_branding_storage_delete" on storage.objects;
create policy "company_branding_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'company-branding'
  and (storage.foldername(name))[1] in (
    select company_id::text from public.profiles where id = auth.uid()
  )
  and (
    public.is_super_admin()
    or public.user_has_permission('company.branding')
    or public.user_has_permission('settings.edit')
  )
);

-- Atomic save: companies.branding (source of truth) + legacy sync targets.
create or replace function public.save_company_brand_center(
  p_company_id uuid,
  p_branding jsonb,
  p_logo_url text default null,
  p_company_name text default null,
  p_legal_name text default null,
  p_support_email text default null,
  p_support_phone text default null,
  p_invoice_footer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branding jsonb := coalesce(p_branding, '{}'::jsonb);
  v_logos jsonb := coalesce(v_branding->'logos', '{}'::jsonb);
  v_colors jsonb := coalesce(v_branding->'colors', '{}'::jsonb);
  v_documents jsonb := coalesce(v_branding->'documents', '{}'::jsonb);
  v_main_logo text;
  v_invoice_logo text;
  v_email_logo text;
  v_favicon text;
  v_watermark text;
  v_primary text;
  v_secondary text;
  v_branch_id uuid;
  v_branch_branding jsonb;
  v_portal_branding jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_company_id is null then
    raise exception 'Company id is required';
  end if;

  if not (
    public.is_super_admin()
    or (
      public.current_company_id() = p_company_id
      and (
        public.user_has_permission('company.branding')
        or public.user_has_permission('settings.edit')
      )
    )
  ) then
    raise exception 'Forbidden';
  end if;

  v_main_logo := coalesce(
    nullif(trim(coalesce(p_logo_url, '')), ''),
    nullif(trim(coalesce(v_logos->>'main', '')), '')
  );
  v_invoice_logo := nullif(trim(coalesce(v_logos->>'invoice', '')), '');
  v_email_logo := nullif(trim(coalesce(v_logos->>'email', '')), '');
  v_favicon := nullif(trim(coalesce(v_logos->>'favicon', '')), '');
  v_watermark := nullif(trim(coalesce(v_documents->>'watermarkUrl', '')), '');
  v_primary := nullif(trim(coalesce(v_colors->>'primary', '')), '');
  v_secondary := nullif(trim(coalesce(v_colors->>'secondary', '')), '');

  update public.companies
  set
    branding = v_branding,
    -- Always mirror logos.main (null clears) so delete/replace stay consistent.
    logo_url = v_main_logo,
    name = coalesce(nullif(trim(coalesce(p_company_name, '')), ''), name),
    contact_email = case
      when p_support_email is null then contact_email
      else nullif(trim(p_support_email), '')
    end,
    contact_phone = case
      when p_support_phone is null then contact_phone
      else nullif(trim(p_support_phone), '')
    end,
    updated_at = now()
  where id = p_company_id;

  insert into public.company_billing_profiles (company_id, legal_name, logo_url, footer_text)
  values (
    p_company_id,
    nullif(trim(coalesce(p_legal_name, '')), ''),
    v_main_logo,
    coalesce(
      nullif(trim(coalesce(p_invoice_footer, '')), ''),
      nullif(trim(coalesce(v_documents->>'invoiceFooter', '')), '')
    )
  )
  on conflict (company_id) do update set
    legal_name = coalesce(
      nullif(trim(coalesce(p_legal_name, '')), ''),
      public.company_billing_profiles.legal_name
    ),
    logo_url = coalesce(v_main_logo, public.company_billing_profiles.logo_url),
    footer_text = coalesce(
      nullif(trim(coalesce(p_invoice_footer, '')), ''),
      nullif(trim(coalesce(v_documents->>'invoiceFooter', '')), ''),
      public.company_billing_profiles.footer_text
    ),
    updated_at = now();

  -- Legacy branch branding (invoice/email consumers already reading branches.branding)
  select id, coalesce(branding, '{}'::jsonb)
    into v_branch_id, v_branch_branding
  from public.branches
  where company_id = p_company_id
    and is_primary = true
    and deleted_at is null
  order by created_at asc
  limit 1;

  if v_branch_id is not null then
    update public.branches
    set
      branding = (
        v_branch_branding
        || jsonb_build_object(
          'primaryColor', v_primary,
          'secondaryColor', v_secondary,
          'invoiceLogoUrl', v_invoice_logo,
          'emailLogoUrl', v_email_logo,
          'watermarkUrl', v_watermark
        )
      ),
      updated_at = now()
    where id = v_branch_id;
  end if;

  -- Portal branding reuse (no separate brand store)
  if exists (
    select 1 from public.customer_portal_settings where company_id = p_company_id
  ) then
    select coalesce(branding, '{}'::jsonb)
      into v_portal_branding
    from public.customer_portal_settings
    where company_id = p_company_id;

    update public.customer_portal_settings
    set
      branding = (
        v_portal_branding
        || jsonb_build_object(
          'logoUrl', v_main_logo,
          'primaryColor', coalesce(v_primary, v_portal_branding->>'primaryColor'),
          'secondaryColor', coalesce(v_secondary, v_portal_branding->>'secondaryColor'),
          'faviconUrl', v_favicon
        )
      ),
      updated_at = now()
    where company_id = p_company_id;
  end if;

  return v_branding;
end;
$$;

revoke all on function public.save_company_brand_center(uuid, jsonb, text, text, text, text, text, text) from public;
grant execute on function public.save_company_brand_center(uuid, jsonb, text, text, text, text, text, text) to authenticated;

comment on function public.save_company_brand_center(uuid, jsonb, text, text, text, text, text, text) is
  'Brand Center save: writes companies.branding and syncs logo/colors to billing, primary branch, portal.';
