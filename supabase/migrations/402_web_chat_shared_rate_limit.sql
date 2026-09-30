-- =============================================================================
-- 402 — Shared Public Web Chat rate-limit buckets (Postgres, service_role only)
-- =============================================================================
-- Replaces process-local in-memory counters for production-safe multi-instance
-- limiting. The api-server still owns policy (keys, limits, windows); this
-- migration only stores atomic fixed-window counters with TTL prune.
--
-- Does NOT: change visitor APIs, Meta, Email, SMS, or grant anon/authenticated.
-- =============================================================================

create table if not exists public.web_chat_rate_limit_buckets (
  bucket_key text primary key,
  window_start timestamptz not null,
  window_ms integer not null
    constraint web_chat_rate_limit_buckets_window_ms_chk
      check (window_ms > 0 and window_ms <= 86400000),
  hit_count integer not null
    constraint web_chat_rate_limit_buckets_hit_count_chk
      check (hit_count >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.web_chat_rate_limit_buckets is
  'Fixed-window Public Web Chat rate-limit counters. Written only via web_chat_rate_limit_consume (service_role).';

create index if not exists web_chat_rate_limit_buckets_window_start_idx
  on public.web_chat_rate_limit_buckets (window_start);

alter table public.web_chat_rate_limit_buckets enable row level security;

drop policy if exists web_chat_rate_limit_buckets_deny_all on public.web_chat_rate_limit_buckets;
create policy web_chat_rate_limit_buckets_deny_all
  on public.web_chat_rate_limit_buckets
  for all
  using (false)
  with check (false);

revoke all on table public.web_chat_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.web_chat_rate_limit_buckets to service_role;

create or replace function public.web_chat_rate_limit_consume(
  p_bucket_key text,
  p_limit integer,
  p_window_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_count integer;
  v_window integer;
  v_allowed boolean;
  v_retry integer;
  v_max_keys integer := 50000;
  v_size integer;
begin
  if p_bucket_key is null or length(p_bucket_key) < 1 or length(p_bucket_key) > 512 then
    raise exception 'invalid_rate_limit_key' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000000 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;
  if p_window_ms is null or p_window_ms < 100 or p_window_ms > 86400000 then
    raise exception 'invalid_rate_limit_window' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('web_chat_rl:' || p_bucket_key));

  delete from public.web_chat_rate_limit_buckets
  where window_start + make_interval(secs => window_ms / 1000.0) <= v_now
    and bucket_key in (
      select b.bucket_key
      from public.web_chat_rate_limit_buckets b
      where b.window_start + make_interval(secs => b.window_ms / 1000.0) <= v_now
      limit 200
    );

  select count(*) into v_size from public.web_chat_rate_limit_buckets;
  if v_size >= v_max_keys then
    delete from public.web_chat_rate_limit_buckets
    where bucket_key in (
      select bucket_key
      from public.web_chat_rate_limit_buckets
      order by updated_at asc
      limit 5000
    );
  end if;

  select window_start, hit_count, window_ms
    into v_start, v_count, v_window
  from public.web_chat_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found or (v_now - v_start) >= make_interval(secs => coalesce(v_window, p_window_ms) / 1000.0) then
    insert into public.web_chat_rate_limit_buckets (bucket_key, window_start, window_ms, hit_count, updated_at)
    values (p_bucket_key, v_now, p_window_ms, 1, v_now)
    on conflict (bucket_key) do update
      set window_start = excluded.window_start,
          window_ms = excluded.window_ms,
          hit_count = 1,
          updated_at = excluded.updated_at;
    v_start := v_now;
    v_count := 1;
    v_window := p_window_ms;
  else
    v_count := v_count + 1;
    update public.web_chat_rate_limit_buckets
    set hit_count = v_count,
        updated_at = v_now
    where bucket_key = p_bucket_key;
  end if;

  v_allowed := v_count <= p_limit;
  if v_allowed then
    v_retry := 0;
  else
    v_retry := greatest(
      1,
      ceil(extract(epoch from (v_start + make_interval(secs => v_window / 1000.0) - v_now)))::integer
    );
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'retry_after_seconds', v_retry,
    'count', v_count
  );
end;
$$;

comment on function public.web_chat_rate_limit_consume(text, integer, integer) is
  'Atomic fixed-window consume for Public Web Chat. service_role only. Failures must fail closed at the API.';

revoke all on function public.web_chat_rate_limit_consume(text, integer, integer) from public, anon, authenticated;
grant execute on function public.web_chat_rate_limit_consume(text, integer, integer) to service_role;
