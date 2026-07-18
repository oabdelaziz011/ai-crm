-- ============================================================
-- Vault OS – Company admin role permission reconciliation
-- Assign existing permission codes to company administrator roles
-- (demo + production company admin roles)
-- ============================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is not null
  and r.is_system = true
  and (
    r.name ilike '%admin%'
    or r.description ilike '%administrator%'
  )
  and p.code in (
    'users.view',
    'users.edit',
    'roles.view',
    'roles.create',
    'roles.edit',
    'roles.delete',
    'audit_logs.view',
    'channels.view',
    'channels.manage',
    'settings.view',
    'settings.edit',
    'ai_assistant.view',
    'ai_assistant.edit',
    'knowledge.view',
    'knowledge.manage',
    'knowledge.import',
    'ai.conversations.view',
    'ai.conversations.reply',
    'ai.conversations.takeover',
    'ai.conversations.release',
    'ai.analytics.view',
    'ai.costs.view',
    'ai_chat.view',
    'ai_chat.use',
    'customers.view',
    'customers.create',
    'customers.edit',
    'customers.delete',
    'bookings.view',
    'bookings.create',
    'bookings.edit',
    'bookings.delete',
    'invoices.view',
    'invoices.create',
    'invoices.edit',
    'invoices.delete',
    'reports.view',
    'workspace.view',
    'billing.view_own',
    'billing.manage_own',
    'billing.contact.edit_own',
    'billing.payment_method.manage_own',
    'billing.documents.download_own',
    'subscriptions.view'
  )
on conflict do nothing;

-- Employee / viewer roles: ensure ai_chat.view for support-style demo roles only (no change to employee role)
