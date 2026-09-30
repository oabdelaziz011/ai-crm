/**
 * Migration 386 — Drop YouTube/Video and Advertisement from NEW onboarding acquisition options.
 *
 * LOCAL ONLY — does not rewrite existing company rows.
 * - companies CHECK still accepts legacy youtube_video / advertisement values
 * - onboarding RPC parser rejects those values for NEW registrations
 * - Social Media → YouTube (acquisition_source_detail = youtube) remains valid
 */

comment on column public.companies.acquisition_source_detail is
  'Nested platform key for social_media (or legacy advertisement), or custom text when Other. Null for sources that do not require detail.';

create or replace function public._company_onboarding_parse_acquisition(
  p_payload jsonb,
  out source text,
  out detail text
)
returns record
language plpgsql
stable
as $$
declare
  v_source text;
  v_detail text;
begin
  v_source := nullif(trim(coalesce(p_payload->>'acquisition_source', '')), '');
  v_detail := nullif(trim(coalesce(p_payload->>'acquisition_source_detail', '')), '');

  if v_source is null then
    raise exception 'acquisition_source_required';
  end if;

  -- Reject retired top-level options for NEW registrations (legacy rows remain readable).
  if v_source in ('youtube_video', 'advertisement') then
    raise exception 'acquisition_source_invalid';
  end if;

  if v_source not in (
    'search_engine',
    'linkedin',
    'social_media',
    'referral',
    'partner_agency',
    'event_conference',
    'direct_outreach',
    'website_blog',
    'other'
  ) then
    raise exception 'acquisition_source_invalid';
  end if;

  -- Top-level sources that must not carry detail
  if v_source in (
    'search_engine',
    'linkedin',
    'referral',
    'partner_agency',
    'event_conference',
    'direct_outreach',
    'website_blog'
  ) then
    if v_detail is not null then
      raise exception 'acquisition_source_detail_not_allowed';
    end if;
    source := v_source;
    detail := null;
    return;
  end if;

  if v_source = 'other' then
    if v_detail is null then
      raise exception 'acquisition_source_detail_required';
    end if;
    if length(v_detail) > 500 then
      raise exception 'acquisition_source_detail_too_long';
    end if;
    source := v_source;
    detail := v_detail;
    return;
  end if;

  if v_source = 'social_media' then
    if v_detail is null then
      raise exception 'acquisition_source_detail_required';
    end if;
    if length(v_detail) > 500 then
      raise exception 'acquisition_source_detail_too_long';
    end if;
    -- Known platforms (incl. youtube) or free-form custom (Other).
    if v_detail not in ('facebook', 'instagram', 'x', 'tiktok', 'youtube')
       and length(btrim(v_detail)) = 0 then
      raise exception 'acquisition_source_detail_required';
    end if;
    -- Disallow persisting the literal token "other" — custom text is required instead.
    if lower(v_detail) = 'other' then
      raise exception 'acquisition_source_detail_required';
    end if;
    source := v_source;
    detail := v_detail;
    return;
  end if;

  raise exception 'acquisition_source_invalid';
end;
$$;

comment on function public._company_onboarding_parse_acquisition(jsonb) is
  'Validates company acquisition for onboarding RPCs. Active sources only; youtube_video/advertisement rejected for new writes; social_media+youtube allowed.';
