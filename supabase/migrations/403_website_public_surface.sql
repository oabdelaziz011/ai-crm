-- =============================================================================
-- 403 — Company website public surface (phase 1)
-- =============================================================================
-- One published site per company, addressed by the portal slug already owned
-- by customer_portal_settings. Visitors read a narrow payload and may submit
-- the contact section into the company's lead pipeline.
--
-- Chat stays on the existing public web chat API. This migration does not
-- grant anon access to web_chat_widgets, sessions, or leads.
-- Does not change rate limits, RLS, or the production web chat kill switch.
-- =============================================================================

create or replace function internal.website_published_context(p_slug text)
returns table (
  company_id uuid,
  slug text,
  name text,
  headline text,
  description text,
  cover_image_url text,
  sections jsonb,
  branding jsonb,
  location jsonb,
  working_hours jsonb,
  widget_id uuid
)
language sql
stable
security definer
set search_path = public, internal
as $$
  select
    s.company_id,
    s.slug,
    coalesce(c.name, s.slug),
    coalesce(nullif(btrim(p.headline_override), ''), c.name, s.slug),
    coalesce(p.description_override, s.description, ''),
    p.cover_image_url,
    p.sections,
    s.branding,
    s.location,
    s.working_hours,
    p.widget_id
  from public.customer_portal_settings s
  join public.web_presence_pages p
    on p.company_id = s.company_id
   and p.portal_settings_id = s.id
  left join public.companies c on c.id = s.company_id
  where lower(btrim(coalesce(p_slug, ''))) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(lower(btrim(p_slug))) <= 48
    and s.slug = lower(btrim(p_slug))
    and s.enabled
    and p.published
    and p.enabled
    and internal.company_publicly_unlocked(s.company_id)
    and public.is_feature_enabled(s.company_id, 'web_presence_page');
$$;

comment on function internal.website_published_context(text) is
  'Published company website row. Service-side only. Public callers use website_public_resolve.';

revoke all on function internal.website_published_context(text) from public, anon, authenticated;
grant execute on function internal.website_published_context(text) to service_role;

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
begin
  select * into v_ctx from internal.website_published_context(p_slug) limit 1;
  if not found then
    return null;
  end if;

  if coalesce((v_ctx.sections->>'services')::boolean, false) then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
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
      select name, description, duration_minutes, price_cents, currency
      from public.scheduling_services
      where company_id = v_ctx.company_id
        and status = 'active'
        and deleted_at is null
      order by name
      limit 24
    ) svc;
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
    'branding', coalesce(v_ctx.branding, '{}'::jsonb),
    'location', coalesce(v_ctx.location, '{}'::jsonb),
    'workingHours', coalesce(v_ctx.working_hours, '{}'::jsonb),
    'services', v_services,
    'reservedHost', v_ctx.slug || '.valueor.site',
    'bookingPath', '/book/' || v_ctx.slug,
    'chat', v_chat
  );
end;
$$;

comment on function public.website_public_resolve(text) is
  'Public company website. No company id, no widget id, no employee id. Chat key only when the section is on and the widget is available.';

revoke all on function public.website_public_resolve(text) from public;
grant execute on function public.website_public_resolve(text) to anon, authenticated, service_role;

create or replace function public.website_public_submit_contact(
  p_slug text,
  p_name text,
  p_email text,
  p_phone text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_ctx record;
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 30), '');
  v_message text := left(btrim(coalesce(p_message, '')), 2000);
  v_pipeline uuid;
  v_stage uuid;
  v_source uuid;
  v_recent integer;
begin
  select * into v_ctx from internal.website_published_context(p_slug) limit 1;
  if not found then
    raise exception 'website_unavailable';
  end if;
  if not coalesce((v_ctx.sections->>'contact')::boolean, false) then
    raise exception 'website_unavailable';
  end if;

  if char_length(v_name) < 1
     or (v_email is null and v_phone is null)
     or (v_email is not null and (position('@' in v_email) < 2 or char_length(v_email) > 200))
     or (v_phone is not null and char_length(v_phone) < 6)
     or char_length(v_message) < 1 then
    raise exception 'website_contact_invalid';
  end if;

  select count(*)::int into v_recent
  from public.leads l
  where l.company_id = v_ctx.company_id
    and l.deleted_at is null
    and l.created_at > now() - interval '1 hour'
    and l.metadata->>'source' = 'website'
    and l.metadata->>'slug' = v_ctx.slug;

  if v_recent >= 10 then
    raise exception 'website_contact_rate_limited';
  end if;

  v_pipeline := public.lead_platform_ensure_default_pipeline(v_ctx.company_id);
  if v_pipeline is null then
    raise exception 'website_unavailable';
  end if;

  select s.id into v_stage
  from public.lead_stages s
  where s.company_id = v_ctx.company_id
    and s.pipeline_id = v_pipeline
    and s.deleted_at is null
    and s.lifecycle_status = 'new'
  order by s.sort_order asc
  limit 1;

  if v_stage is null then
    raise exception 'website_unavailable';
  end if;

  select src.id into v_source
  from public.lead_sources src
  where src.company_id = v_ctx.company_id
    and src.slug = 'website'
    and src.deleted_at is null
  limit 1;

  if v_source is null then
    insert into public.lead_sources (company_id, name, slug, channel_type)
    values (v_ctx.company_id, 'Website', 'website', 'web')
    returning id into v_source;
  end if;

  insert into public.leads (
    company_id, pipeline_id, stage_id, source_id, title, contact_name, email, phone, metadata
  ) values (
    v_ctx.company_id,
    v_pipeline,
    v_stage,
    v_source,
    left(coalesce(nullif(v_message, ''), v_name), 180),
    v_name,
    v_email,
    v_phone,
    jsonb_build_object('source', 'website', 'slug', v_ctx.slug, 'message', v_message)
  );

  return jsonb_build_object('accepted', true);
end;
$$;

comment on function public.website_public_submit_contact(text, text, text, text, text) is
  'Published website contact section → one lead on the company default pipeline. No lead id is returned. Capped at 10 website leads per slug per hour.';

revoke all on function public.website_public_submit_contact(text, text, text, text, text) from public;
grant execute on function public.website_public_submit_contact(text, text, text, text, text) to anon, authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'internal.website_published_context(text)', 'execute')
     or has_function_privilege('authenticated', 'internal.website_published_context(text)', 'execute') then
    raise exception '403 fail-closed: website context must stay service-side';
  end if;
  if not has_function_privilege('anon', 'public.website_public_resolve(text)', 'execute') then
    raise exception '403 fail-closed: public resolve must be executable by anon';
  end if;
  if has_table_privilege('anon', 'public.web_chat_widgets', 'select')
     or has_table_privilege('anon', 'public.web_presence_pages', 'select')
     or has_table_privilege('anon', 'public.web_chat_visitor_sessions', 'select') then
    raise exception '403 fail-closed: anon must not read website or chat tables';
  end if;
  if internal.resolve_channel_commercial_feature_code('web_chat') is not null then
    raise exception '403 fail-closed: web_chat must remain non-commercial';
  end if;
end $$;
