-- =============================================================================
-- 479 — Customer-initiated sales order cancellation workflow
-- Additive / idempotent. Company-scoped RLS. Does not rewrite 471–478.
-- =============================================================================

insert into public.permissions (code, category, module, action, description)
values
  (
    'orders.approve_cancellation',
    'Orders',
    'Orders',
    'ApproveCancellation',
    'Approve or reject customer cancellation requests on sales orders'
  )
on conflict (code) do update
set category = excluded.category,
    module = excluded.module,
    action = excluded.action,
    description = excluded.description,
    updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'orders.approve_cancellation'),
    ('manager', 'orders.approve_cancellation')
) as v(template_key, permission_code)
on conflict do nothing;

-- Order-level cancellation audit columns (direct cancel path)
alter table public.sales_orders
  add column if not exists cancellation_source text null,
  add column if not exists cancellation_reason text null,
  add column if not exists cancelled_from_status text null,
  add column if not exists cancellation_notify_status text not null default 'none',
  add column if not exists cancellation_notify_message_id text null,
  add column if not exists cancellation_notify_error text null,
  add column if not exists cancellation_notify_idempotency_key text null,
  add column if not exists cancellation_notify_attempted_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_orders_cancellation_source_check'
  ) then
    alter table public.sales_orders
      add constraint sales_orders_cancellation_source_check
      check (
        cancellation_source is null
        or cancellation_source in ('customer', 'employee', 'system')
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'sales_orders_cancellation_notify_status_check'
  ) then
    alter table public.sales_orders
      add constraint sales_orders_cancellation_notify_status_check
      check (cancellation_notify_status in ('none', 'pending', 'sent', 'failed', 'skipped'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'sales_orders_cancelled_from_status_check'
  ) then
    alter table public.sales_orders
      add constraint sales_orders_cancelled_from_status_check
      check (
        cancelled_from_status is null
        or cancelled_from_status in (
          'draft', 'pending_approval', 'confirmed', 'processing',
          'out_for_delivery', 'delivered', 'cancelled'
        )
      );
  end if;
end $$;

create table if not exists public.sales_order_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  status text not null default 'pending',
  source text not null default 'customer',
  reason text null,
  order_status_at_request text not null,
  customer_id uuid null references public.customers(id) on delete set null,
  customer_phone text not null default '',
  conversation_id uuid null references public.conversations(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz null,
  decided_by uuid null references public.profiles(id) on delete set null,
  decision_reason text null,
  notification_idempotency_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_order_cancellation_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint sales_order_cancellation_requests_source_check
    check (source in ('customer')),
  constraint sales_order_cancellation_requests_order_status_check
    check (
      order_status_at_request in (
        'pending_approval', 'confirmed', 'processing', 'out_for_delivery',
        'delivered', 'cancelled', 'draft'
      )
    )
);

create unique index if not exists sales_order_cancellation_requests_one_pending_uidx
  on public.sales_order_cancellation_requests (order_id)
  where status = 'pending';

create index if not exists sales_order_cancellation_requests_company_status_idx
  on public.sales_order_cancellation_requests (company_id, status, requested_at desc);

create index if not exists sales_order_cancellation_requests_order_idx
  on public.sales_order_cancellation_requests (order_id, requested_at desc);

alter table public.sales_order_cancellation_requests enable row level security;

drop policy if exists sales_order_cancellation_requests_company on public.sales_order_cancellation_requests;
create policy sales_order_cancellation_requests_company
  on public.sales_order_cancellation_requests
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

grant select, insert, update on public.sales_order_cancellation_requests to authenticated;
grant select, insert, update, delete on public.sales_order_cancellation_requests to service_role;

-- DEFAULT admin/manager templates
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and r.template_key in ('admin', 'manager')
  and p.code = 'orders.approve_cancellation'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );

-- System company roles that can already edit orders
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_assign.id
from public.roles r
join public.permissions p_assign on p_assign.code = 'orders.approve_cancellation'
join public.role_permissions rp_edit on rp_edit.role_id = r.id
join public.permissions p_edit
  on p_edit.id = rp_edit.permission_id and p_edit.code = 'orders.edit'
where r.company_id is not null
  and r.is_system is true
  and coalesce(r.role_type, 'CUSTOM') <> 'PLATFORM'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p_assign.id
  );

-- AI cancellation tools (seed). confirm_order_cancellation requires explicit customerConfirmed.
insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'list_customer_orders_for_cancellation',
    'List Customer Orders For Cancellation',
    'List this customer''s orders for cancellation (ownership verified by phone/conversation). Use when the customer wants to cancel. Never invent orders.',
    'sales', '1.0.0', true,
    '["tools.execute","orders.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"customerPhone":{"type":"string"},"orderNumber":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"code":{"type":"string"},"orders":{"type":"array"}}}'::jsonb,
    15000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  ),
  (
    'get_order_cancellation_eligibility',
    'Get Order Cancellation Eligibility',
    'Check whether an owned order can be cancelled directly, needs an employee-approved request, is already cancelled, or cannot be cancelled (e.g. delivered).',
    'sales', '1.0.0', true,
    '["tools.execute","orders.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"orderId":{"type":"string"},"orderNumber":{"type":"string"},"customerPhone":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"code":{"type":"string"},"eligibility":{"type":"object"},"order":{"type":"object"}}}'::jsonb,
    15000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  ),
  (
    'confirm_order_cancellation',
    'Confirm Order Cancellation',
    'After explicit customer confirmation only (customerConfirmed=true): directly cancel pending_approval/confirmed orders, or create a pending cancellation request for processing/out_for_delivery. Reason optional. Never claim cancelled unless the tool returns cancellation_completed.',
    'sales', '1.0.0', true,
    '["tools.execute","orders.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"orderId":{"type":"string"},"customerConfirmed":{"type":"boolean"},"customerPhone":{"type":"string"},"reason":{"type":"string"}},"required":["orderId","customerConfirmed"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"code":{"type":"string"},"path":{"type":"string"},"requestId":{"type":"string"},"order":{"type":"object"}}}'::jsonb,
    30000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  is_enabled = excluded.is_enabled,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();
