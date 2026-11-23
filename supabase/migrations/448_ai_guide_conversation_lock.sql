-- Phase 0B trusted Guide identity (DO NOT treat metadata.source as mutable authority).
-- ai_guide_locked is set on insert from Guide markers and can never be cleared by clients.
-- Apply locally only after explicit approval; this file is for review until then.

alter table public.conversations
  add column if not exists ai_guide_locked boolean not null default false;

comment on column public.conversations.ai_guide_locked is
  'Authoritative AI Guide lock. Once true, clients cannot clear it; tool router must deny all tools.';

create index if not exists conversations_ai_guide_locked_idx
  on public.conversations (company_id, ai_guide_locked)
  where ai_guide_locked = true and deleted_at is null;

create or replace function public.conversations_ai_guide_lock_enforce()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  guide_marker boolean := false;
begin
  guide_marker :=
    coalesce(new.metadata->>'source', '') = 'floating_ai_guide'
    or coalesce(new.metadata->>'assistantSurface', '') = 'guide'
    or coalesce((new.metadata->>'guideMode')::text, '') in ('true', 'True', '1');

  if tg_op = 'INSERT' then
    if guide_marker then
      new.ai_guide_locked := true;
    end if;
    return new;
  end if;

  -- UPDATE: lock is sticky; clients cannot unlock or strip Guide classification.
  if old.ai_guide_locked is true then
    new.ai_guide_locked := true;
    if coalesce(new.metadata, '{}'::jsonb) is distinct from coalesce(old.metadata, '{}'::jsonb) then
      new.metadata :=
        coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source', 'floating_ai_guide',
          'assistantSurface', 'guide',
          'guideMode', true
        );
    end if;
  elsif guide_marker then
    -- Allow lock to engage later if markers appear, but never reverse.
    new.ai_guide_locked := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_conversations_ai_guide_lock on public.conversations;
create trigger trg_conversations_ai_guide_lock
  before insert or update on public.conversations
  for each row
  execute function public.conversations_ai_guide_lock_enforce();

revoke all on function public.conversations_ai_guide_lock_enforce() from public;
grant execute on function public.conversations_ai_guide_lock_enforce() to postgres, service_role;

-- Authenticated, membership-checked Guide classification for tool gates.
create or replace function public.resolve_conversation_ai_tool_gate(p_conversation_id uuid)
returns table (
  conversation_id uuid,
  company_id uuid,
  ai_guide_locked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_locked boolean;
  v_member boolean := false;
begin
  if v_uid is null then
    return;
  end if;

  select c.company_id, c.ai_guide_locked
    into v_company, v_locked
  from public.conversations c
  where c.id = p_conversation_id
    and c.deleted_at is null;

  if v_company is null then
    return;
  end if;

  if public.is_super_admin() then
    v_member := true;
  else
    select exists (
      select 1
      from public.profiles p
      where p.id = v_uid
        and p.company_id = v_company
    ) into v_member;
  end if;

  if not v_member then
    return;
  end if;

  conversation_id := p_conversation_id;
  company_id := v_company;
  ai_guide_locked := coalesce(v_locked, false);
  return next;
end;
$$;

comment on function public.resolve_conversation_ai_tool_gate(uuid) is
  'Returns Guide lock + company for an authenticated member. Empty result = deny tools (fail closed).';

revoke all on function public.resolve_conversation_ai_tool_gate(uuid) from public;
grant execute on function public.resolve_conversation_ai_tool_gate(uuid) to authenticated, service_role;
