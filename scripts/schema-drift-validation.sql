-- Schema drift validation for public.companies (migrations 003 + 032)
-- Run via: supabase db query --linked -f scripts/schema-drift-validation.sql
-- Returns one row per failed check (empty result = all checks passed).

with checks as (
  -- Defaults
  select 'default.status' as check_id,
         pg_get_expr(d.adbin, d.adrelid) as live,
         '''Trial''::text' as expected
  from pg_attribute a
  join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.companies'::regclass and a.attname = 'status'
    and pg_get_expr(d.adbin, d.adrelid) is distinct from '''Trial''::text'

  union all

  select 'default.subscription_plan',
         pg_get_expr(d.adbin, d.adrelid),
         '''Basic''::text'
  from pg_attribute a
  join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.companies'::regclass and a.attname = 'subscription_plan'
    and pg_get_expr(d.adbin, d.adrelid) is distinct from '''Basic''::text'

  union all

  select 'default.subscription_status',
         pg_get_expr(d.adbin, d.adrelid),
         '''trialing''::text'
  from pg_attribute a
  join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.companies'::regclass and a.attname = 'subscription_status'
    and pg_get_expr(d.adbin, d.adrelid) is distinct from '''trialing''::text'

  union all

  select 'default.billing_cycle',
         pg_get_expr(d.adbin, d.adrelid),
         '''monthly''::text'
  from pg_attribute a
  join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.companies'::regclass and a.attname = 'billing_cycle'
    and pg_get_expr(d.adbin, d.adrelid) is distinct from '''monthly''::text'

  union all

  -- Nullability
  select 'nullable.' || a.attname,
         case when a.attnotnull then 'NOT NULL' else 'NULL' end,
         'NOT NULL'
  from pg_attribute a
  where a.attrelid = 'public.companies'::regclass
    and a.attname in ('status', 'subscription_status', 'billing_cycle', 'created_at', 'updated_at')
    and a.attnum > 0 and not a.attisdropped and not a.attnotnull

  union all

  -- CHECK constraints
  select 'missing.constraint.' || expected.conname,
         coalesce(live.definition, '<missing>'),
         expected.definition
  from (
    values
      ('companies_status_check', 'CHECK ((status = ANY (ARRAY[''Active''::text, ''Suspended''::text, ''Trial''::text])))'),
      ('companies_billing_cycle_check', 'CHECK ((billing_cycle = ANY (ARRAY[''monthly''::text, ''yearly''::text])))'),
      ('companies_subscription_status_check', 'CHECK ((subscription_status = ANY (ARRAY[''active''::text, ''trialing''::text, ''past_due''::text, ''grace_period''::text, ''canceled''::text, ''expired''::text])))')
  ) as expected(conname, definition)
  left join (
    select conname, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where conrelid = 'public.companies'::regclass and contype = 'c'
  ) live on live.conname = expected.conname
  where live.conname is null

  union all

  -- Indexes
  select 'missing.index.' || expected.indexname,
         '<missing>',
         expected.indexdef
  from (
    values
      ('idx_companies_status', 'CREATE INDEX idx_companies_status ON public.companies USING btree (status)'),
      ('idx_companies_subscription_status', 'CREATE INDEX idx_companies_subscription_status ON public.companies USING btree (subscription_status)'),
      ('idx_companies_billing_cycle', 'CREATE INDEX idx_companies_billing_cycle ON public.companies USING btree (billing_cycle)'),
      ('idx_companies_subscription_expires_at', 'CREATE INDEX idx_companies_subscription_expires_at ON public.companies USING btree (subscription_expires_at)'),
      ('idx_companies_plan_id', 'CREATE INDEX idx_companies_plan_id ON public.companies USING btree (plan_id)')
  ) as expected(indexname, indexdef)
  left join pg_indexes i
    on i.schemaname = 'public' and i.tablename = 'companies' and i.indexname = expected.indexname
  where i.indexname is null

  union all

  -- Foreign keys
  select 'missing.fk.companies_plan_id_fkey', '<missing>', 'FOREIGN KEY (plan_id) REFERENCES plans(id)'
  where not exists (
    select 1 from pg_constraint
    where conrelid = 'public.companies'::regclass and conname = 'companies_plan_id_fkey'
  )

  union all

  -- Triggers
  select 'missing.trigger.' || expected.tgname, '<missing>', expected.fn
  from (
    values
      ('companies_updated_at', 'set_updated_at()'),
      ('trg_audit_companies', 'write_audit_log()'),
      ('trg_notify_subscription_events', 'notify_subscription_events()')
  ) as expected(tgname, fn)
  left join pg_trigger t
    on t.tgrelid = 'public.companies'::regclass and t.tgname = expected.tgname and not t.tgisinternal
  where t.tgname is null

  union all

  -- RLS policies
  select 'missing.policy.' || expected.policyname, '<missing>', expected.cmd
  from (
    values
      ('companies_super_admin_select', 'SELECT'),
      ('companies_super_admin_insert', 'INSERT'),
      ('companies_super_admin_update', 'UPDATE'),
      ('companies_super_admin_delete', 'DELETE'),
      ('companies_member_select', 'SELECT')
  ) as expected(policyname, cmd)
  left join pg_policies p
    on p.schemaname = 'public' and p.tablename = 'companies' and p.policyname = expected.policyname
  where p.policyname is null

  union all

  -- RLS enabled
  select 'rls.companies_disabled', 'disabled', 'enabled'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'companies' and c.relkind = 'r' and not c.relrowsecurity

  union all

  -- Data validity
  select 'data.status.invalid', status, 'Active|Suspended|Trial'
  from public.companies
  where status is null or status not in ('Active', 'Suspended', 'Trial')

  union all

  select 'data.subscription_status.invalid', subscription_status, 'active|trialing|past_due|grace_period|canceled|expired'
  from public.companies
  where subscription_status is null
     or subscription_status not in ('active', 'trialing', 'past_due', 'grace_period', 'canceled', 'expired')

  union all

  select 'data.billing_cycle.invalid', billing_cycle, 'monthly|yearly'
  from public.companies
  where billing_cycle is null or billing_cycle not in ('monthly', 'yearly')
)
select * from checks order by check_id;
