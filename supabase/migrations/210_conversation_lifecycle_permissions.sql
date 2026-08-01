-- Sprint 9.2.1 — Enterprise conversation lifecycle RBAC permissions

insert into public.permissions (code, category, module, action, description)
values
  ('conversation.view', 'Conversations', 'Omnichannel', 'View', 'View omnichannel conversations'),
  ('conversation.assign', 'Conversations', 'Omnichannel', 'Assign', 'Assign conversations to agents or queues'),
  ('conversation.reassign', 'Conversations', 'Omnichannel', 'Reassign', 'Reassign conversations between agents or teams'),
  ('conversation.take_over', 'Conversations', 'Omnichannel', 'Take over', 'Take ownership of a conversation'),
  ('conversation.return_to_ai', 'Conversations', 'Omnichannel', 'Return to AI', 'Release conversation back to AI handling'),
  ('conversation.escalate', 'Conversations', 'Omnichannel', 'Escalate', 'Escalate conversations to supervisors'),
  ('conversation.resolve', 'Conversations', 'Omnichannel', 'Resolve', 'Mark conversations as resolved'),
  ('conversation.close', 'Conversations', 'Omnichannel', 'Close', 'Close conversations'),
  ('conversation.reopen', 'Conversations', 'Omnichannel', 'Reopen', 'Reopen closed conversations'),
  ('conversation.internal_note', 'Conversations', 'Omnichannel', 'Internal note', 'Add internal notes to conversations'),
  ('conversation.link_customer', 'Conversations', 'Omnichannel', 'Link customer', 'Link an existing customer to a conversation'),
  ('conversation.create_customer', 'Conversations', 'Omnichannel', 'Create customer', 'Create a customer from a conversation'),
  ('conversation.reply', 'Conversations', 'Omnichannel', 'Reply', 'Reply to customer messages')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- Admin: full lifecycle permissions
insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'conversation.view'),
    ('admin', 'conversation.assign'),
    ('admin', 'conversation.reassign'),
    ('admin', 'conversation.take_over'),
    ('admin', 'conversation.return_to_ai'),
    ('admin', 'conversation.escalate'),
    ('admin', 'conversation.resolve'),
    ('admin', 'conversation.close'),
    ('admin', 'conversation.reopen'),
    ('admin', 'conversation.internal_note'),
    ('admin', 'conversation.link_customer'),
    ('admin', 'conversation.create_customer'),
    ('admin', 'conversation.reply'),
    ('manager', 'conversation.view'),
    ('manager', 'conversation.assign'),
    ('manager', 'conversation.reassign'),
    ('manager', 'conversation.take_over'),
    ('manager', 'conversation.return_to_ai'),
    ('manager', 'conversation.escalate'),
    ('manager', 'conversation.resolve'),
    ('manager', 'conversation.close'),
    ('manager', 'conversation.reopen'),
    ('manager', 'conversation.internal_note'),
    ('manager', 'conversation.link_customer'),
    ('manager', 'conversation.create_customer'),
    ('manager', 'conversation.reply'),
    ('employee', 'conversation.view'),
    ('employee', 'conversation.assign'),
    ('employee', 'conversation.take_over'),
    ('employee', 'conversation.return_to_ai'),
    ('employee', 'conversation.escalate'),
    ('employee', 'conversation.resolve'),
    ('employee', 'conversation.close'),
    ('employee', 'conversation.reopen'),
    ('employee', 'conversation.internal_note'),
    ('employee', 'conversation.link_customer'),
    ('employee', 'conversation.create_customer'),
    ('employee', 'conversation.reply')
) as v(template_key, permission_code)
on conflict do nothing;
