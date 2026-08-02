-- Sprint 10.6.2 — Internal notes management permission

insert into public.permissions (code, category, module, action, description)
values
  ('conversation.internal_notes.manage', 'Conversations', 'Omnichannel', 'Manage internal notes', 'Edit and delete internal notes on conversations')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'conversation.internal_notes.manage'),
    ('manager', 'conversation.internal_notes.manage'),
    ('employee', 'conversation.internal_notes.manage')
) as v(template_key, permission_code)
on conflict do nothing;
