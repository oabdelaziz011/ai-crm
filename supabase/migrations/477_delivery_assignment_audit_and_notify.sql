-- Delivery assignment audit history + pending reason + WhatsApp notify tracking.

alter table public.sales_orders
  add column if not exists assignment_pending_reason text null;

alter table public.sales_orders
  add column if not exists delivery_assignment_mode_applied text null;

alter table public.sales_orders
  add column if not exists delivery_notify_status text not null default 'none';

alter table public.sales_orders
  add column if not exists delivery_notify_message_id text null;

alter table public.sales_orders
  add column if not exists delivery_notify_error text null;

alter table public.sales_orders
  add column if not exists delivery_notify_idempotency_key text null;

alter table public.sales_orders
  add column if not exists delivery_notify_attempted_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_orders_delivery_assignment_mode_applied_chk'
  ) then
    alter table public.sales_orders
      add constraint sales_orders_delivery_assignment_mode_applied_chk
      check (
        delivery_assignment_mode_applied is null
        or delivery_assignment_mode_applied in ('manual', 'ai')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_orders_delivery_notify_status_chk'
  ) then
    alter table public.sales_orders
      add constraint sales_orders_delivery_notify_status_chk
      check (delivery_notify_status in ('none', 'pending', 'sent', 'failed'));
  end if;
end $$;

create table if not exists public.sales_order_delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  previous_worker_id uuid null references public.company_delivery_workers(id) on delete set null,
  new_worker_id uuid null references public.company_delivery_workers(id) on delete set null,
  assignment_mode text not null,
  assigned_by uuid null references public.profiles(id) on delete set null,
  reassignment_reason text null,
  outcome text not null default 'assigned',
  created_at timestamptz not null default now(),
  constraint sales_order_delivery_assignments_mode_chk
    check (assignment_mode in ('manual', 'ai')),
  constraint sales_order_delivery_assignments_outcome_chk
    check (outcome in ('assigned', 'reassigned', 'failed'))
);

create index if not exists sales_order_delivery_assignments_order_idx
  on public.sales_order_delivery_assignments (order_id, created_at desc);

create index if not exists sales_order_delivery_assignments_company_idx
  on public.sales_order_delivery_assignments (company_id, created_at desc);

alter table public.sales_order_delivery_assignments enable row level security;

drop policy if exists sales_order_delivery_assignments_company on public.sales_order_delivery_assignments;
create policy sales_order_delivery_assignments_company
  on public.sales_order_delivery_assignments
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

revoke all on table public.sales_order_delivery_assignments from anon, public;
grant select, insert, update on table public.sales_order_delivery_assignments to authenticated;
grant select, insert, update, delete on table public.sales_order_delivery_assignments to service_role;

comment on column public.sales_orders.assignment_pending_reason is
  'When set, order is confirmed but awaiting a valid delivery worker (Pending assignment UX).';
comment on column public.sales_orders.delivery_notify_status is
  'WhatsApp dispatch lifecycle for the assigned worker; assignment success is independent of this.';
comment on table public.sales_order_delivery_assignments is
  'Auditable delivery worker assignment / reassignment history (company-scoped).';
