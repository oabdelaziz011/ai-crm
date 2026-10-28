/**
 * Migration 437 — Customer import jobs (additive, local-safe).
 *
 * Durable job + row outcome tracking for CRM CSV/XLSX import.
 * Does NOT create a second customers table.
 * DO NOT apply to hosted/production without explicit approval.
 */

create table if not exists public.customer_import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'draft'
    check (status in (
      'draft', 'parsed', 'mapped', 'validated', 'confirming',
      'running', 'cancelling', 'cancelled', 'completed', 'failed'
    )),
  source_kind text not null default 'csv_xlsx'
    check (source_kind in ('csv_xlsx')),
  file_name text,
  file_size_bytes integer,
  content_sha256 text,
  selected_sheet_index integer default 0,
  duplicate_policy text not null default 'skip'
    check (duplicate_policy in ('skip', 'update', 'flag')),
  default_phone_region text,
  mapping_json jsonb not null default '[]'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  staged_rows_json jsonb,
  validation_issues_json jsonb not null default '[]'::jsonb,
  duplicate_candidates_json jsonb not null default '[]'::jsonb,
  worksheets_json jsonb not null default '[]'::jsonb,
  columns_json jsonb not null default '[]'::jsonb,
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  flagged_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  cancel_requested boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_import_jobs_company_created
  on public.customer_import_jobs (company_id, created_at desc);

create index if not exists idx_customer_import_jobs_company_status
  on public.customer_import_jobs (company_id, status);

create table if not exists public.customer_import_row_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.customer_import_jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  row_number integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'created', 'updated', 'skipped', 'flagged', 'invalid', 'failed')),
  customer_id uuid references public.customers(id) on delete set null,
  idempotency_key text not null,
  error_code text,
  error_message text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, row_number),
  unique (company_id, idempotency_key)
);

create index if not exists idx_customer_import_row_results_job
  on public.customer_import_row_results (job_id, row_number);

alter table public.customer_import_jobs enable row level security;
alter table public.customer_import_row_results enable row level security;

drop policy if exists customer_import_jobs_select on public.customer_import_jobs;
create policy customer_import_jobs_select
  on public.customer_import_jobs
  for select
  to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.has_company_permission('customers.import')
      or public.has_company_permission('customers.create')
      or public.has_company_permission('customers.view')
    )
  );

drop policy if exists customer_import_jobs_insert on public.customer_import_jobs;
create policy customer_import_jobs_insert
  on public.customer_import_jobs
  for insert
  to authenticated
  with check (
    company_id = public.current_company_id()
    and created_by = auth.uid()
    and (
      public.has_company_permission('customers.import')
      or public.has_company_permission('customers.create')
    )
  );

drop policy if exists customer_import_jobs_update on public.customer_import_jobs;
create policy customer_import_jobs_update
  on public.customer_import_jobs
  for update
  to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.has_company_permission('customers.import')
      or public.has_company_permission('customers.create')
    )
  )
  with check (
    company_id = public.current_company_id()
    and (
      public.has_company_permission('customers.import')
      or public.has_company_permission('customers.create')
    )
  );

drop policy if exists customer_import_row_results_select on public.customer_import_row_results;
create policy customer_import_row_results_select
  on public.customer_import_row_results
  for select
  to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.has_company_permission('customers.import')
      or public.has_company_permission('customers.create')
      or public.has_company_permission('customers.view')
    )
  );

drop policy if exists customer_import_row_results_insert on public.customer_import_row_results;
create policy customer_import_row_results_insert
  on public.customer_import_row_results
  for insert
  to authenticated
  with check (
    company_id = public.current_company_id()
    and (
      public.has_company_permission('customers.import')
      or public.has_company_permission('customers.create')
    )
  );

drop policy if exists customer_import_row_results_update on public.customer_import_row_results;
create policy customer_import_row_results_update
  on public.customer_import_row_results
  for update
  to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.has_company_permission('customers.import')
      or public.has_company_permission('customers.create')
    )
  )
  with check (
    company_id = public.current_company_id()
    and (
      public.has_company_permission('customers.import')
      or public.has_company_permission('customers.create')
    )
  );

grant select, insert, update on public.customer_import_jobs to authenticated;
grant select, insert, update on public.customer_import_row_results to authenticated;
grant all on public.customer_import_jobs to service_role;
grant all on public.customer_import_row_results to service_role;

comment on table public.customer_import_jobs is
  'CRM customer import jobs. staged_rows_json is temporary and expires via expires_at.';
comment on table public.customer_import_row_results is
  'Per-row outcomes for customer import jobs. Idempotent via company_id + idempotency_key.';
