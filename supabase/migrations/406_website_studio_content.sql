-- Website Studio content lives on the existing page row. Company facts stay in their source tables.
-- Unpublished pages still resolve to null.

alter table public.web_presence_pages
  add column if not exists content jsonb not null default '{}'::jsonb;

alter table public.web_presence_pages
  drop constraint if exists web_presence_pages_content_object;

alter table public.web_presence_pages
  add constraint web_presence_pages_content_object
  check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 48000);

comment on column public.web_presence_pages.content is
  'Presentation for this company website: section order, CTAs, selected service ids, and color overrides. Catalog, hours, location, and logo stay in their source tables.';

create or replace function public.website_public_resolve(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, internal
as $$
declare
  v_ctx record;
  v_chat jsonb := null;
  v_widget public.web_chat_widgets%rowtype;
  v_services jsonb := '[]'::jsonb;
  v_gallery jsonb := jsonb_build_object('direction', 'left', 'slides', '[]'::jsonb);
  v_branding jsonb := '{}'::jsonb;
  v_content jsonb := '{}'::jsonb;
  v_location jsonb := '{}'::jsonb;
  v_hours jsonb := '{}'::jsonb;
  v_branch_address text;
  v_branch_city text;
  v_branch_country text;
  v_branch_settings jsonb;
begin
  select * into v_ctx from internal.website_published_context(p_slug) limit 1;
  if not found then
    return null;
  end if;

  select coalesce(p.content, '{}'::jsonb)
  into v_content
  from public.web_presence_pages p
  where p.company_id = v_ctx.company_id;

  select jsonb_strip_nulls(jsonb_build_object(
    'logoUrl', coalesce(
      nullif(btrim(coalesce(c.branding #>> '{logos,main}', '')), ''),
      nullif(btrim(coalesce(c.logo_url, '')), ''),
      nullif(btrim(coalesce(v_ctx.branding->>'logoUrl', '')), '')
    ),
    'primaryColor', coalesce(
      case
        when btrim(coalesce(c.branding #>> '{colors,primary}', '')) ~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
          then btrim(c.branding #>> '{colors,primary}')
        else null
      end,
      case
        when btrim(coalesce(v_ctx.branding->>'primaryColor', '')) ~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
          then btrim(v_ctx.branding->>'primaryColor')
        else null
      end
    ),
    'coverImageUrl', coalesce(
      nullif(btrim(coalesce(v_ctx.branding->>'coverImageUrl', '')), ''),
      nullif(btrim(coalesce(v_ctx.cover_image_url, '')), '')
    )
  ))
  into v_branding
  from public.companies c
  where c.id = v_ctx.company_id;

  v_location := coalesce(v_ctx.location, '{}'::jsonb);
  v_hours := coalesce(v_ctx.working_hours, '{}'::jsonb);
  select b.address_line1, b.city, b.country, b.settings
    into v_branch_address, v_branch_city, v_branch_country, v_branch_settings
  from public.branches b
  where b.company_id = v_ctx.company_id
    and b.deleted_at is null
    and b.status = 'active'
  order by b.is_primary desc nulls last
  limit 1;
  if nullif(btrim(coalesce(v_location->>'address', '')), '') is null
     and nullif(btrim(coalesce(v_location->>'city', '')), '') is null
     and (v_branch_address is not null or v_branch_city is not null) then
    v_location := jsonb_strip_nulls(jsonb_build_object(
      'address', nullif(btrim(coalesce(v_branch_address, '')), ''),
      'city', nullif(btrim(coalesce(v_branch_city, '')), '')
    ));
  end if;
  if v_hours = '{}'::jsonb and jsonb_typeof(v_branch_settings->'weeklyHours') = 'array' then
    select coalesce(jsonb_object_agg(day_name, day_value), '{}'::jsonb)
      into v_hours
    from (
      select
        (array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])[((item->>'day_of_week')::int) + 1] as day_name,
        jsonb_build_object('open', left(item->>'opens_at', 5), 'close', left(item->>'closes_at', 5)) as day_value
      from jsonb_array_elements(v_branch_settings->'weeklyHours') item
      where (item->>'day_of_week') ~ '^[0-6]$'
        and coalesce(item->>'is_closed', '') not in ('true', 't')
        and coalesce(item->>'opens_at', '') <> ''
        and coalesce(item->>'closes_at', '') <> ''
    ) days;
  end if;

  if coalesce((v_ctx.sections->>'services')::boolean, false) then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', svc.id,
          'name', svc.name,
          'description', left(coalesce(svc.description, ''), 280),
          'durationMinutes', svc.duration_minutes,
          'priceCents', svc.price_cents,
          'currency', coalesce(svc.currency, 'USD')
        )
        order by svc.name
      ),
      '[]'::jsonb
    )
    into v_services
    from (
      select id, name, description, duration_minutes, price_cents, currency
      from public.scheduling_services
      where company_id = v_ctx.company_id
        and status = 'active'
        and deleted_at is null
      order by name
      limit 24
    ) svc;
  end if;

  if coalesce((v_ctx.sections->>'gallery')::boolean, false) then
    select jsonb_build_object(
      'direction', case when p.gallery->>'direction' = 'right' then 'right' else 'left' end,
      'slides', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'url', filtered.url,
            'alt', filtered.alt
          )
          order by filtered.ord
        )
        from (
          select
            slide->>'url' as url,
            left(coalesce(slide->>'alt', ''), 120) as alt,
            ord
          from jsonb_array_elements(coalesce(p.gallery->'slides', '[]'::jsonb)) with ordinality as item(slide, ord)
          where coalesce(slide->>'url', '') ~ '^(https://[^[:space:]]+|http://(localhost|127\.0\.0\.1)(:[0-9]+)?/storage/v1/object/public/company-branding/[^[:space:]]+)$'
          order by ord
          limit 8
        ) filtered
      ), '[]'::jsonb)
    )
    into v_gallery
    from public.web_presence_pages p
    where p.company_id = v_ctx.company_id;
  end if;

  if coalesce((v_ctx.sections->>'chat')::boolean, false) and v_ctx.widget_id is not null then
    select * into v_widget
    from public.web_chat_widgets w
    where w.id = v_ctx.widget_id
      and w.company_id = v_ctx.company_id;
    if found and internal.web_chat_widget_available(v_widget.id) then
      v_chat := jsonb_build_object(
        'publicKey', v_widget.public_key,
        'greeting', v_widget.greeting,
        'assistant', (
          coalesce(v_widget.config->>'aiEnabled', 'true') is distinct from 'false'
          and internal.web_chat_widget_employee_id(v_widget.id) is not null
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'slug', v_ctx.slug,
    'name', v_ctx.name,
    'headline', v_ctx.headline,
    'description', v_ctx.description,
    'coverImageUrl', v_ctx.cover_image_url,
    'sections', v_ctx.sections,
    'branding', coalesce(v_branding, '{}'::jsonb),
    'location', coalesce(v_location, '{}'::jsonb),
    'workingHours', coalesce(v_hours, '{}'::jsonb),
    'services', v_services,
    'gallery', coalesce(v_gallery, jsonb_build_object('direction', 'left', 'slides', '[]'::jsonb)),
    'content', coalesce(v_content, '{}'::jsonb),
    'reservedHost', v_ctx.slug || '.valueor.site',
    'bookingPath', '/book/' || v_ctx.slug,
    'chat', v_chat
  );
end;
$$;

comment on function public.website_public_resolve(text) is
  'Public company website. Branding is read from companies (Brand Center); portal branding is only the existing cover/logo fallback.';
