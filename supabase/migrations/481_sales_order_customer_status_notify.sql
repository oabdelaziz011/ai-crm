-- Additive: customer order-status WhatsApp notify bookkeeping on sales_orders.
-- Expand-only; does not alter existing delivery_notify_* worker columns.

alter table public.sales_orders
  add column if not exists customer_status_notify_status text not null default 'none';

alter table public.sales_orders
  add column if not exists customer_status_notify_message_id text null;

alter table public.sales_orders
  add column if not exists customer_status_notify_error text null;

alter table public.sales_orders
  add column if not exists customer_status_notify_idempotency_key text null;

alter table public.sales_orders
  add column if not exists customer_status_notify_attempted_at timestamptz null;

alter table public.sales_orders
  add column if not exists customer_status_notify_for_status text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_orders_customer_status_notify_status_chk'
  ) then
    alter table public.sales_orders
      add constraint sales_orders_customer_status_notify_status_chk
      check (customer_status_notify_status in ('none', 'pending', 'sent', 'failed', 'skipped'));
  end if;
end $$;

comment on column public.sales_orders.customer_status_notify_status is
  'Customer WhatsApp status-follow-up outcome for the latest lifecycle transition (none|pending|sent|failed|skipped).';
comment on column public.sales_orders.customer_status_notify_for_status is
  'Order status that the latest customer_status_notify_* attempt corresponds to.';
