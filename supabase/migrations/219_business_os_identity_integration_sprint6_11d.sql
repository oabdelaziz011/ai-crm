-- Sprint 6.11D: Business OS integration — conversation ↔ lead identity links.

alter table public.conversations
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

create index if not exists idx_conversations_company_lead
  on public.conversations(company_id, lead_id)
  where deleted_at is null and lead_id is not null;

create index if not exists idx_leads_conversation
  on public.leads(conversation_id)
  where deleted_at is null and conversation_id is not null;

create index if not exists idx_leads_customer
  on public.leads(company_id, customer_id)
  where deleted_at is null and customer_id is not null;
