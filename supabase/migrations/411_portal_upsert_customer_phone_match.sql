-- Match public and staff booking customers by canonical phone so the same
-- mobile number reuses one CRM profile instead of inserting another row.

create or replace function internal.portal_upsert_customer(
  p_company_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_owner_user_id uuid,
  p_preferred_language text default 'en',
  p_marketing_consent boolean default false,
  p_phone_e164 text default null,
  p_phone_country_iso text default null,
  p_phone_region_source text default null,
  p_phone_national text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_owner uuid;
  v_trusted boolean;
  v_phone_e164 text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_phone_iso text := nullif(upper(btrim(coalesce(p_phone_country_iso, ''))), '');
  v_phone_source text := nullif(btrim(coalesce(p_phone_region_source, '')), '');
  v_phone_national text := nullif(btrim(coalesce(p_phone_national, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  v_trusted :=
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      auth.role() = 'authenticated'
      and public.current_company_id() = p_company_id
      and internal.company_publicly_unlocked(p_company_id)
    );

  if not v_trusted and not internal.portal_company_publicly_available(p_company_id) then
    raise exception 'Portal unavailable';
  end if;

  if v_phone_e164 is not null and v_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid phone_e164 format';
  end if;
  if v_phone_iso is not null and v_phone_iso !~ '^[A-Z]{2}$' then
    raise exception 'invalid phone_country_iso format';
  end if;
  if v_phone_source is not null
     and v_phone_source not in ('explicit', 'e164', 'channel', 'import', 'unresolved') then
    raise exception 'invalid phone_region_source';
  end if;

  if p_owner_user_id is not null then
    select coalesce(p.user_id, p.id) into v_owner
    from public.profiles p
    where (p.id = p_owner_user_id or p.user_id = p_owner_user_id)
      and p.company_id = p_company_id
      and coalesce(p.is_active, true) = true
    limit 1;
  end if;

  if v_owner is null then
    select coalesce(p.user_id, p.id) into v_owner
    from public.profiles p
    where p.company_id = p_company_id and coalesce(p.is_active, true) = true
    limit 1;
  end if;
  if v_owner is null then
    raise exception 'No company owner found for customer creation';
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.company_id = p_company_id
    and (
      (v_phone_e164 is not null and c.phone_e164 = v_phone_e164)
      or (v_phone_e164 is not null and c.phone = v_phone_e164)
      or (v_phone is not null and c.phone = v_phone)
      or (
        v_phone_national is not null
        and v_phone_iso is not null
        and c.phone_national = v_phone_national
        and c.phone_country_iso = v_phone_iso
      )
    )
  order by (c.phone_e164 is not null) desc, c.created_at asc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      user_id,
      company_id,
      name,
      email,
      phone,
      phone_e164,
      phone_country_iso,
      phone_region_source,
      phone_national
    )
    values (
      v_owner,
      p_company_id,
      p_name,
      p_email,
      coalesce(v_phone_e164, v_phone),
      v_phone_e164,
      v_phone_iso,
      v_phone_source,
      v_phone_national
    )
    returning id into v_customer_id;

    insert into public.customer_communication_preferences (
      company_id, customer_id, language, receive_marketing
    ) values (
      p_company_id, v_customer_id, coalesce(p_preferred_language, 'en'), p_marketing_consent
    )
    on conflict (company_id, customer_id) do nothing;

    return v_customer_id;
  end if;

  if v_phone_e164 is not null then
    update public.customers
    set phone_e164 = v_phone_e164,
        phone_country_iso = coalesce(phone_country_iso, v_phone_iso),
        phone_region_source = coalesce(phone_region_source, v_phone_source),
        phone_national = coalesce(phone_national, v_phone_national),
        updated_at = now()
    where id = v_customer_id
      and company_id = p_company_id
      and phone_e164 is null
      and not exists (
        select 1
        from public.customers other
        where other.company_id = p_company_id
          and other.phone_e164 = v_phone_e164
          and other.id <> v_customer_id
      );
  end if;

  if v_trusted then
    update public.customers
    set email = p_email,
        updated_at = now()
    where id = v_customer_id
      and company_id = p_company_id
      and nullif(btrim(coalesce(email, '')), '') is null
      and nullif(btrim(coalesce(p_email, '')), '') is not null;

    insert into public.customer_communication_preferences (
      company_id, customer_id, language, receive_marketing
    ) values (
      p_company_id, v_customer_id, coalesce(p_preferred_language, 'en'), p_marketing_consent
    )
    on conflict (company_id, customer_id) do update
    set language = excluded.language,
        receive_marketing = excluded.receive_marketing,
        updated_at = now();
  else
    update public.customers
    set email = p_email,
        updated_at = now()
    where id = v_customer_id
      and company_id = p_company_id
      and nullif(btrim(coalesce(email, '')), '') is null
      and nullif(btrim(coalesce(p_email, '')), '') is not null;

    insert into public.customer_communication_preferences (
      company_id, customer_id, language, receive_marketing
    ) values (
      p_company_id, v_customer_id, coalesce(p_preferred_language, 'en'), p_marketing_consent
    )
    on conflict (company_id, customer_id) do nothing;
  end if;

  return v_customer_id;
end;
$$;
