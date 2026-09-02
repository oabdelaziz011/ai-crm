-- ============================================================
-- 337 — Human Handoff Agent needs channel.platform.dispatch
--
-- Omnichannel agent replies go through channel-platform outbound
-- dispatch, which requires channel.platform.dispatch. The HHA
-- template had conversation.reply / ai.conversations.reply but
-- not the channel dispatch permission, so desk agents got:
--   "Permission denied: channel.platform.dispatch"
-- ============================================================

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('human_handoff_agent', 'channel.platform.dispatch')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

do $$
begin
  if not exists (
    select 1 from public.permissions where code = 'channel.platform.dispatch'
  ) then
    raise exception 'channel.platform.dispatch permission missing from catalog';
  end if;
end;
$$;

-- Backfill every provisioned Human Handoff Agent role (DEFAULT + any renamed copies with template_key).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'channel.platform.dispatch'
where r.template_key = 'human_handoff_agent'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
