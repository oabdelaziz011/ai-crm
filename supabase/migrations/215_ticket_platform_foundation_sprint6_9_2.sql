-- Sprint 6.9.2: Enterprise Ticket Platform Foundation — SLA columns and indexes.

alter table public.support_tickets
  add column if not exists sla_due_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id) on delete set null;

create index if not exists idx_support_tickets_company_conversation
  on public.support_tickets(company_id, conversation_id)
  where deleted_at is null;

create index if not exists idx_support_tickets_company_customer
  on public.support_tickets(company_id, customer_id)
  where deleted_at is null;

create index if not exists idx_support_tickets_company_sla_due
  on public.support_tickets(company_id, sla_due_at)
  where deleted_at is null and status in ('open', 'in_progress', 'waiting_customer');

-- Backfill SLA due dates for existing open tickets without SLA.
update public.support_tickets
set sla_due_at = case priority
  when 'urgent' then created_at + interval '4 hours'
  when 'high' then created_at + interval '8 hours'
  when 'low' then created_at + interval '72 hours'
  else created_at + interval '24 hours'
end
where sla_due_at is null
  and deleted_at is null
  and status in ('open', 'in_progress', 'waiting_customer');

-- Backfill resolved_at from closed_at for terminal tickets.
update public.support_tickets
set resolved_at = closed_at
where resolved_at is null
  and closed_at is not null
  and status in ('resolved', 'closed');
