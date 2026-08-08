-- Sprint 3.12.1 — AI Smart Lead Capture foundation
-- Prospect/capture state lives on leads.metadata.aiCapture (no parallel CRM).
-- Audit trail is separate from timeline.

create table if not exists public.lead_ai_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  decision text not null,
  reason text not null default '',
  confidence numeric null,
  actor text not null default 'ai' check (actor = 'ai'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_ai_audit_company_lead_created
  on public.lead_ai_audit_log (company_id, lead_id, created_at desc);

create index if not exists idx_lead_ai_audit_conversation
  on public.lead_ai_audit_log (company_id, conversation_id, created_at desc);

alter table public.lead_ai_audit_log enable row level security;

drop policy if exists lead_ai_audit_tenant on public.lead_ai_audit_log;
create policy lead_ai_audit_tenant on public.lead_ai_audit_log
  for all
  using (public.company_has_permission(company_id, 'leads.view'));

comment on table public.lead_ai_audit_log is
  'AI Smart Lead Capture decision audit (Sprint 3.12.1). Not the entity timeline.';
