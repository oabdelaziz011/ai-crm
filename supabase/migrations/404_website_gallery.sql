-- =============================================================================
-- 404 — Website gallery on the published company page
-- =============================================================================
-- Slides live on the page row. Visitors receive only safe public image URLs
-- when the gallery section is on. Storage writes for website managers stay
-- inside {company}/website-gallery and do not widen brand-center access.
-- Does not change chat, booking, leads, rate limits, or the kill switch.
-- =============================================================================

alter table public.web_presence_pages
  add column if not exists gallery jsonb not null default '{"direction":"left","slides":[]}'::jsonb;

alter table public.web_presence_pages
  drop constraint if exists web_presence_pages_gallery_shape;

alter table public.web_presence_pages
  add constraint web_presence_pages_gallery_shape check (
    jsonb_typeof(gallery) = 'object'
    and coalesce(gallery->>'direction', 'left') in ('left', 'right')
    and jsonb_typeof(coalesce(gallery->'slides', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(gallery->'slides', '[]'::jsonb)) <= 8
  );

comment on column public.web_presence_pages.gallery is
  'Visitor reel: direction left|right and up to 8 public image slides.';

drop policy if exists "company_branding_website_gallery_insert" on storage.objects;
create policy "company_branding_website_gallery_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-branding'
    and (storage.foldername(name))[1] in (
      select company_id::text from public.profiles where id = auth.uid()
    )
    and (storage.foldername(name))[2] = 'website-gallery'
    and (
      public.is_super_admin()
      or public.user_has_permission('web_presence.manage')
    )
  );

drop policy if exists "company_branding_website_gallery_delete" on storage.objects;
create policy "company_branding_website_gallery_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-branding'
    and (storage.foldername(name))[1] in (
      select company_id::text from public.profiles where id = auth.uid()
    )
    and (storage.foldername(name))[2] = 'website-gallery'
    and (
      public.is_super_admin()
      or public.user_has_permission('web_presence.manage')
    )
  );

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
    'branding', coalesce(v_ctx.branding, '{}'::jsonb),
    'location', coalesce(v_ctx.location, '{}'::jsonb),
    'workingHours', coalesce(v_ctx.working_hours, '{}'::jsonb),
    'services', v_services,
    'gallery', coalesce(v_gallery, jsonb_build_object('direction', 'left', 'slides', '[]'::jsonb)),
    'reservedHost', v_ctx.slug || '.valueor.site',
    'bookingPath', '/book/' || v_ctx.slug,
    'chat', v_chat
  );
end;
$$;

comment on function public.website_public_resolve(text) is
  'Public company website. Gallery slides are public image URLs only, and only when that section is on.';
