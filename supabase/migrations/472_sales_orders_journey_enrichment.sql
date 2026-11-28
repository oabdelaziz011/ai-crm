-- Sales order journey enrichment: attribution, location, CRM query indexes, AI order tools.
-- Isolated from sales_follow_up_*. Local/dev apply only from agent tooling. No production deploy from this script.

-- Enrichment columns (idempotent)
alter table public.sales_orders
  add column if not exists customer_email text not null default '',
  add column if not exists preferred_language text not null default '',
  add column if not exists delivery_lat double precision null,
  add column if not exists delivery_lng double precision null,
  add column if not exists delivery_location_url text not null default '',
  add column if not exists source_channel text not null default '',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists ai_employee_id uuid null references public.ai_employees(id) on delete set null,
  add column if not exists assigned_salesperson_id uuid null references public.profiles(id) on delete set null,
  add column if not exists created_by_ai boolean not null default false,
  add column if not exists confirmation_fingerprint text not null default '',
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejected_by uuid null references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_orders_payment_status_check'
      and conrelid = 'public.sales_orders'::regclass
  ) then
    alter table public.sales_orders
      add constraint sales_orders_payment_status_check
      check (payment_status in ('unpaid', 'pending', 'paid', 'refunded', 'failed'));
  end if;
end $$;

create index if not exists sales_orders_company_customer_idx
  on public.sales_orders (company_id, customer_id, created_at desc)
  where customer_id is not null;

create index if not exists sales_orders_company_conversation_idx
  on public.sales_orders (company_id, conversation_id)
  where conversation_id is not null;

create unique index if not exists sales_orders_company_confirmation_fingerprint_uidx
  on public.sales_orders (company_id, confirmation_fingerprint)
  where confirmation_fingerprint <> '';

-- AI order tools (seed). create_sales_order requires explicit customerConfirmed in runtime validation.
insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'validate_delivery_zone',
    'Validate Delivery Zone',
    'Look up an enabled company delivery zone by governorate and city/area. Returns fee and ETA only from saved zones. Never invents fees or ETAs.',
    'sales', '1.0.0', true,
    '["tools.execute","orders.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"governorate":{"type":"string"},"zoneName":{"type":"string"}},"required":["governorate","zoneName"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"supported":{"type":"boolean"},"zoneId":{"type":"string"},"deliveryFee":{"type":"number"},"etaMin":{"type":"number"},"etaMax":{"type":"number"},"etaUnit":{"type":"string"}}}'::jsonb,
    15000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  ),
  (
    'preview_sales_order',
    'Preview Sales Order',
    'Compute subtotal, delivery fee, and total from catalog prices and an enabled delivery zone. Does not create an order. Requires AI order collection enabled for the company.',
    'sales', '1.0.0', true,
    '["tools.execute","orders.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"items":{"type":"array"},"governorate":{"type":"string"},"zoneName":{"type":"string"},"customerName":{"type":"string"},"customerPhone":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"subtotal":{"type":"number"},"deliveryFee":{"type":"number"},"totalAmount":{"type":"number"},"currency":{"type":"string"}}}'::jsonb,
    20000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  ),
  (
    'create_sales_order',
    'Create Sales Order',
    'Create a COD sales order only after explicit customer confirmation (customerConfirmed=true) when AI order collection is enabled. Defaults to pending_approval when human approval is required. Never marks paid or delivered.',
    'sales', '1.0.0', true,
    '["tools.execute","orders.create"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"customerConfirmed":{"type":"boolean"},"items":{"type":"array"},"customerName":{"type":"string"},"customerPhone":{"type":"string"},"customerEmail":{"type":"string"},"governorate":{"type":"string"},"zoneName":{"type":"string"},"deliveryAddress":{"type":"string"},"deliveryNotes":{"type":"string"},"preferredLanguage":{"type":"string"},"deliveryLocationUrl":{"type":"string"},"deliveryLat":{"type":"number"},"deliveryLng":{"type":"number"}},"required":["customerConfirmed","items","customerName","customerPhone","governorate","zoneName","deliveryAddress"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"orderId":{"type":"string"},"orderNumber":{"type":"string"},"status":{"type":"string"},"requireHumanApproval":{"type":"boolean"},"customerId":{"type":"string"}}}'::jsonb,
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
