-- Sprint 6.9.1: AI Employee Ticket Management — domain tables, RBAC, tool definitions.

insert into public.permissions (code, category, module, action, description)
values
  ('tickets.view', 'Tickets', 'Tickets', 'View', 'View support tickets'),
  ('tickets.create', 'Tickets', 'Tickets', 'Create', 'Create support tickets'),
  ('tickets.edit', 'Tickets', 'Tickets', 'Edit', 'Update support ticket fields'),
  ('tickets.assign', 'Tickets', 'Tickets', 'Assign', 'Assign support tickets to agents'),
  ('tickets.comment', 'Tickets', 'Tickets', 'Comment', 'Add comments to support tickets'),
  ('tickets.close', 'Tickets', 'Tickets', 'Close', 'Close or resolve support tickets'),
  ('tickets.manage', 'Tickets', 'Tickets', 'Manage', 'Manage support ticket platform settings')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'tickets.view'),
    ('admin', 'tickets.create'),
    ('admin', 'tickets.edit'),
    ('admin', 'tickets.assign'),
    ('admin', 'tickets.comment'),
    ('admin', 'tickets.close'),
    ('admin', 'tickets.manage')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in (
    'tickets.view',
    'tickets.create',
    'tickets.edit',
    'tickets.assign',
    'tickets.comment',
    'tickets.close',
    'tickets.manage'
  )
where r.company_id is not null
  and r.is_system = true
  and (
    r.template_key = 'admin'
    or r.name ilike '%admin%'
    or r.description ilike '%administrator%'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

create sequence if not exists public.support_ticket_number_seq;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_number text not null,
  subject text not null check (char_length(trim(subject)) > 0),
  description text not null default '',
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, ticket_number)
);

create index if not exists idx_support_tickets_company_status
  on public.support_tickets(company_id, status)
  where deleted_at is null;

create index if not exists idx_support_tickets_company_priority
  on public.support_tickets(company_id, priority)
  where deleted_at is null;

create index if not exists idx_support_tickets_company_assigned
  on public.support_tickets(company_id, assigned_user_id)
  where deleted_at is null and assigned_user_id is not null;

create index if not exists idx_support_tickets_company_customer
  on public.support_tickets(company_id, customer_id)
  where deleted_at is null and customer_id is not null;

create table if not exists public.support_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  is_internal boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_comments_ticket
  on public.support_ticket_comments(ticket_id, created_at desc);

drop trigger if exists support_tickets_updated_at on public.support_tickets;
create trigger support_tickets_updated_at
  before update on public.support_tickets
  for each row execute procedure public.set_updated_at();

create or replace function public.generate_support_ticket_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.support_ticket_number_seq');
  return 'TKT-' || lpad(v_seq::text, 6, '0');
end;
$$;

create or replace function public.write_support_ticket_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id text;
  v_company_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;
  v_company_id := coalesce(new.company_id, old.company_id);

  if TG_TABLE_NAME = 'support_tickets' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'ticketNumber', new.ticket_number,
        'subject', new.subject,
        'status', new.status,
        'priority', new.priority
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'ticketNumber', new.ticket_number,
        'old', jsonb_build_object('status', old.status, 'priority', old.priority, 'assignedUserId', old.assigned_user_id),
        'new', jsonb_build_object('status', new.status, 'priority', new.priority, 'assignedUserId', new.assigned_user_id)
      );
    else
      v_metadata := jsonb_build_object('ticketNumber', old.ticket_number, 'subject', old.subject);
    end if;
  elsif TG_TABLE_NAME = 'support_ticket_comments' then
    v_company_id := coalesce(new.company_id, old.company_id);
    v_entity_id := coalesce(new.ticket_id, old.ticket_id)::text;
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('isInternal', new.is_internal, 'bodyPreview', left(new.body, 120));
    else
      v_metadata := jsonb_build_object('isInternal', coalesce(new.is_internal, old.is_internal));
    end if;
  end if;

  insert into public.audit_logs (user_id, company_id, action, entity, entity_id, metadata)
  values (auth.uid(), v_company_id, v_action, TG_TABLE_NAME, v_entity_id, v_metadata);

  return coalesce(new, old);
end;
$$;

drop trigger if exists support_tickets_audit on public.support_tickets;
create trigger support_tickets_audit
  after insert or update or delete on public.support_tickets
  for each row execute procedure public.write_support_ticket_audit_log();

drop trigger if exists support_ticket_comments_audit on public.support_ticket_comments;
create trigger support_ticket_comments_audit
  after insert or update or delete on public.support_ticket_comments
  for each row execute procedure public.write_support_ticket_audit_log();

alter table public.support_tickets enable row level security;
alter table public.support_ticket_comments enable row level security;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select using (
  deleted_at is null
  and public.company_has_permission(company_id, 'tickets.view')
);

drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert with check (
  public.company_has_permission(company_id, 'tickets.create')
);

drop policy if exists support_tickets_update on public.support_tickets;
create policy support_tickets_update on public.support_tickets for update using (
  deleted_at is null
  and public.company_has_permission(company_id, 'tickets.edit')
) with check (
  public.company_has_permission(company_id, 'tickets.edit')
);

drop policy if exists support_tickets_delete on public.support_tickets;
create policy support_tickets_delete on public.support_tickets for delete using (
  public.company_has_permission(company_id, 'tickets.manage')
);

drop policy if exists support_ticket_comments_select on public.support_ticket_comments;
create policy support_ticket_comments_select on public.support_ticket_comments for select using (
  public.company_has_permission(company_id, 'tickets.view')
);

drop policy if exists support_ticket_comments_insert on public.support_ticket_comments;
create policy support_ticket_comments_insert on public.support_ticket_comments for insert with check (
  public.company_has_permission(company_id, 'tickets.comment')
);

-- Tool definitions
insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'create_ticket',
    'Create Ticket',
    'Create a new support ticket with subject, description, priority, and optional customer or conversation link.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.create"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"subject":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"customerId":{"type":"string"},"conversationId":{"type":"string"}},"required":["subject"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"ticketNumber":{"type":"string"}}}'::jsonb,
    30000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'update_ticket',
    'Update Ticket',
    'Update mutable fields on an existing support ticket such as subject or description.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"subject":{"type":"string"},"description":{"type":"string"}},"required":["ticketId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"}}}'::jsonb,
    30000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'close_ticket',
    'Close Ticket',
    'Close or resolve a support ticket with optional resolution note.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.close"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"resolutionNote":{"type":"string"},"status":{"type":"string"}},"required":["ticketId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"status":{"type":"string"}}}'::jsonb,
    30000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'assign_ticket',
    'Assign Ticket',
    'Assign a support ticket to an agent by user id or display name.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.assign"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"assigneeUserId":{"type":"string"},"assigneeName":{"type":"string"}},"required":["ticketId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"assignedUserId":{"type":"string"}}}'::jsonb,
    30000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'add_ticket_comment',
    'Add Ticket Comment',
    'Add a public or internal comment to a support ticket.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.comment"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"body":{"type":"string"},"isInternal":{"type":"boolean"}},"required":["ticketId","body"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"commentId":{"type":"string"}}}'::jsonb,
    20000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'change_ticket_priority',
    'Change Ticket Priority',
    'Change the priority of a support ticket (low, normal, high, urgent).',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"priority":{"type":"string"}},"required":["ticketId","priority"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"priority":{"type":"string"}}}'::jsonb,
    20000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'change_ticket_status',
    'Change Ticket Status',
    'Change the workflow status of a support ticket.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"status":{"type":"string"}},"required":["ticketId","status"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"status":{"type":"string"}}}'::jsonb,
    20000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'search_ticket',
    'Search Tickets',
    'Search support tickets by query, status, priority, assignee, or customer.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"query":{"type":"string"},"status":{"type":"string"},"priority":{"type":"string"},"assigneeName":{"type":"string"},"customerId":{"type":"string"},"limit":{"type":"number"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"total":{"type":"number"},"tickets":{"type":"array"}}}'::jsonb,
    30000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  )
on conflict (key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  version = excluded.version,
  is_enabled = excluded.is_enabled,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();
