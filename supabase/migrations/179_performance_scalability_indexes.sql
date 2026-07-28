-- Sprint P3: composite indexes for tenant-scoped list queries and audit browsing

create index if not exists idx_audit_logs_company_created_at
  on public.audit_logs(company_id, created_at desc);

create index if not exists idx_profiles_company_created_at
  on public.profiles(company_id, created_at desc)
  where is_active = true;

create index if not exists idx_scheduling_bookings_company_status_start
  on public.scheduling_bookings(company_id, status, start_at desc)
  where deleted_at is null;

create index if not exists idx_bookings_company_status_created
  on public.bookings(company_id, status, created_at desc);

create index if not exists idx_conversations_company_created_at
  on public.conversations(company_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_invoices_company_status_date
  on public.invoices(company_id, status, invoice_date desc);

create index if not exists idx_knowledge_documents_company_updated
  on public.knowledge_documents(company_id, updated_at desc);

comment on index idx_audit_logs_company_created_at is
  'Tenant audit log browser — company scoped, newest first.';
comment on index idx_scheduling_bookings_company_status_start is
  'Scheduling list/calendar queries filtered by company and status.';
