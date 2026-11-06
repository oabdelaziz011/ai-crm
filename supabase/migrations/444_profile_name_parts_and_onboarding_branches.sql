-- Local migration only. Do not apply to Production until explicitly approved.
--
-- Effect:
--   1. profiles.first_name, middle_name, and last_name are added as nullable text.
--      Existing rows are not backfilled and full_name is not rewritten.
--   2. handle_new_user stores the three parts only when signup metadata includes all of them,
--      and still writes the combined full_name. A conflict does not overwrite a name that
--      is already stored.
--   3. save_onboarding_branches lets the company admin who owns that company update the
--      primary branch created during onboarding and insert additional branches.
--      Another company's id is rejected. anon is not granted.
--
-- Hours and the map link are stored on the existing branches.settings jsonb
-- (locationUrl, weeklyHours). No second branch table is created.
-- Break periods remain on scheduling resources, not on this branch payload.
--
-- Rollback while no other object depends on these columns:
--   drop function if exists public.save_onboarding_branches(uuid, jsonb);
--   alter table public.profiles
--     drop column if exists first_name,
--     drop column if exists middle_name,
--     drop column if exists last_name;
--   Then restore public.handle_new_user() from 295_owner_phone_onboarding_fix.sql.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text;

comment on column public.profiles.first_name is
  'Given name from signup. Null for accounts that only have full_name.';
comment on column public.profiles.middle_name is
  'Middle name from signup. Null for accounts that only have full_name.';
comment on column public.profiles.last_name is
  'Family name from signup. Null for accounts that only have full_name.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_first text;
  v_middle text;
  v_last text;
  v_full_name text;
  v_job_title text;
  v_phone text;
begin
  v_first := nullif(trim(new.raw_user_meta_data->>'first_name'), '');
  v_middle := nullif(trim(new.raw_user_meta_data->>'middle_name'), '');
  v_last := nullif(trim(new.raw_user_meta_data->>'last_name'), '');

  if v_first is not null and v_middle is not null and v_last is not null then
    v_full_name := nullif(trim(concat_ws(' ', v_first, v_middle, v_last)), '');
  else
    v_first := null;
    v_middle := null;
    v_last := null;
    v_full_name := coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(new.email, '@', 1), '')
    );
  end if;

  v_job_title := nullif(trim(new.raw_user_meta_data->>'job_title'), '');
  v_phone := nullif(trim(new.raw_user_meta_data->>'phone'), '');
  if v_phone is not null and length(v_phone) > 40 then
    v_phone := left(v_phone, 40);
  end if;

  insert into public.profiles (
    id, user_id, email, full_name, first_name, middle_name, last_name, role, job_title, phone
  )
  values (
    new.id,
    new.id,
    new.email,
    v_full_name,
    v_first,
    v_middle,
    v_last,
    coalesce(new.raw_user_meta_data->>'role', null),
    v_job_title,
    v_phone
  )
  on conflict (id) do update
  set
    user_id = excluded.user_id,
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    middle_name = coalesce(public.profiles.middle_name, excluded.middle_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    job_title = coalesce(public.profiles.job_title, excluded.job_title),
    phone = coalesce(public.profiles.phone, excluded.phone),
    updated_at = now();

  update public.profiles
  set
    id = new.id,
    email = coalesce(email, new.email),
    full_name = coalesce(full_name, v_full_name),
    first_name = coalesce(first_name, v_first),
    middle_name = coalesce(middle_name, v_middle),
    last_name = coalesce(last_name, v_last),
    job_title = coalesce(job_title, v_job_title),
    phone = coalesce(phone, v_phone),
    updated_at = now()
  where user_id = new.id
    and id is distinct from new.id;

  return new;
end;
$$;

create or replace function public.save_onboarding_branches(p_company_id uuid, p_branches jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_item jsonb;
  v_name text;
  v_url text;
  v_address text;
  v_is_main boolean;
  v_hours jsonb;
  v_day jsonb;
  v_open integer;
  v_main_count integer := 0;
  v_primary uuid;
  v_id uuid;
  v_code text;
  v_index integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_company_id is null or jsonb_typeof(p_branches) <> 'array' or jsonb_array_length(p_branches) < 1 then
    raise exception 'invalid_payload';
  end if;

  select p.company_id
    into v_company
  from public.profiles p
  where p.id = v_uid or p.user_id = v_uid
  order by case when p.id = v_uid then 0 else 1 end
  limit 1;

  if v_company is null or v_company <> p_company_id then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_uid
      and r.company_id = p_company_id
      and r.template_key = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  for v_item in select value from jsonb_array_elements(p_branches)
  loop
    if coalesce((v_item->>'is_main')::boolean, false) then
      v_main_count := v_main_count + 1;
    end if;
  end loop;
  if v_main_count <> 1 then
    raise exception 'branch_main_required';
  end if;

  select b.id
    into v_primary
  from public.branches b
  where b.company_id = p_company_id
    and b.deleted_at is null
    and b.is_primary = true
  order by b.created_at
  limit 1;

  for v_item in select value from jsonb_array_elements(p_branches)
  loop
    v_index := v_index + 1;
    v_name := nullif(trim(v_item->>'name'), '');
    v_url := nullif(trim(v_item->>'location_url'), '');
    v_address := nullif(trim(v_item->>'address'), '');
    v_is_main := coalesce((v_item->>'is_main')::boolean, false);
    v_hours := v_item->'weekly_hours';

    if v_name is null or char_length(v_name) > 200 then
      raise exception 'branch_name_required';
    end if;
    if v_address is null then
      raise exception 'branch_address_required';
    end if;
    if v_url is null or v_url !~* '^https?://((www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?/maps([/?#].*)?|maps\.google\.[a-z]{2,3}(\.[a-z]{2})?([/?#].*)?|maps\.app\.goo\.gl(/.*)?|goo\.gl/maps(/.*)?)$' then
      raise exception 'branch_location_url_invalid';
    end if;
    if v_hours is null or jsonb_typeof(v_hours) <> 'array' then
      raise exception 'branch_hours_invalid';
    end if;

    v_open := 0;
    for v_day in select value from jsonb_array_elements(v_hours)
    loop
      if coalesce((v_day->>'is_closed')::boolean, false) then
        continue;
      end if;
      if coalesce(v_day->>'opens_at', '') !~ '^[0-2][0-9]:[0-5][0-9]$'
         or coalesce(v_day->>'closes_at', '') !~ '^[0-2][0-9]:[0-5][0-9]$'
         or (v_day->>'opens_at') >= (v_day->>'closes_at') then
        raise exception 'branch_hours_invalid';
      end if;
      v_open := v_open + 1;
    end loop;
    if v_open < 1 then
      raise exception 'branch_hours_invalid';
    end if;

    if v_is_main and v_primary is not null then
      update public.branches
      set
        name = v_name,
        address_line1 = v_address,
        city = coalesce(nullif(trim(v_item->>'city'), ''), city),
        country = coalesce(nullif(trim(v_item->>'country'), ''), country),
        timezone = coalesce(nullif(trim(v_item->>'timezone'), ''), timezone),
        code = coalesce(code, 'MAIN'),
        is_primary = true,
        settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
          'locationUrl', v_url,
          'weeklyHours', v_hours
        ),
        updated_by = v_uid,
        updated_at = now()
      where id = v_primary
        and company_id = p_company_id;
      v_id := v_primary;
    else
      v_code := case when v_is_main then 'MAIN' else 'BR' || v_index::text end;
      select b.id
        into v_id
      from public.branches b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and lower(b.name) = lower(v_name)
      limit 1;

      if v_id is null then
        insert into public.branches (
          company_id, name, code, timezone, status, address_line1, city, country,
          is_primary, settings, created_by, updated_by
        )
        values (
          p_company_id,
          v_name,
          v_code,
          coalesce(nullif(trim(v_item->>'timezone'), ''), 'UTC'),
          'active',
          v_address,
          nullif(trim(v_item->>'city'), ''),
          nullif(trim(v_item->>'country'), ''),
          v_is_main,
          jsonb_build_object('locationUrl', v_url, 'weeklyHours', v_hours),
          v_uid,
          v_uid
        )
        returning id into v_id;
      else
        update public.branches
        set
          address_line1 = v_address,
          is_primary = v_is_main,
          settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
            'locationUrl', v_url,
            'weeklyHours', v_hours
          ),
          updated_by = v_uid,
          updated_at = now()
        where id = v_id
          and company_id = p_company_id;
      end if;
    end if;

    v_ids := v_ids || jsonb_build_array(v_id);
  end loop;

  return jsonb_build_object('branch_ids', v_ids);
end;
$$;

revoke all on function public.save_onboarding_branches(uuid, jsonb) from public;
revoke all on function public.save_onboarding_branches(uuid, jsonb) from anon;
grant execute on function public.save_onboarding_branches(uuid, jsonb) to authenticated;

comment on function public.save_onboarding_branches(uuid, jsonb) is
  'Owner onboarding only. Caller profile company_id must match, and the caller must hold that company admin role.';
