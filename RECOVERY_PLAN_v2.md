# Production Database Recovery Plan v2

**Repository:** ValueOR  
**Status:** REDESIGNED — **DO NOT EXECUTE** until reviewed  
**Supersedes:** `RECOVERY_PLAN.md` (Plan C as written is **invalid**)  
**Date:** 2026-08-04  

---

## 0. Correction — why Plan C failed

### Observed CLI behavior (user evidence)

```bash
pnpm supabase db push --linked --dry-run
```

Lists pending migrations in **version order**:

```
215 → 216 → 217 → … → 227 → 229
```

Supabase applies migrations in **ascending numeric version order**. It does **not** skip ahead to 229.

### Failure chain on current production

| Step | What happens |
|------|----------------|
| 1 | `schema_migrations` has **214** applied |
| 2 | `db push` selects **215** as next migration |
| 3 | `215_ticket_platform_foundation_sprint6_9_2.sql` runs `ALTER TABLE public.support_tickets …` |
| 4 | **`support_tickets` does not exist** → migration **215 fails** |
| 5 | **216–229 never run**, including **229** |

**Conclusion:** Plan C (“run `db push` and let 229 fix production”) **cannot work**. Any valid recovery must ensure **229-equivalent schema exists before migration 215 SQL executes**, or ensure **215–228 are skipped** so the runner reaches **229** first.

---

## 1. Recovery objective

| Goal | Constraint |
|------|------------|
| Restore schema for repo migrations **214–227** | Do not recreate database / project |
| Record **229** in `schema_migrations` via normal tooling | Prefer official migration runner for 229 |
| Do **not** re-run broken chain **215–228** as written | Those files assume 214 schema exists |
| Do **not** modify migration **files** in this phase | Use existing `229_production_recovery.sql` |
| Fix **214 mis-key** only in documentation | Do not `repair reverted` 214 unless explicitly approved |

---

## 2. Two valid execution strategies

Both satisfy: **229 body executes before 215 SQL is attempted.**

### Strategy 1 — Schema first, then metadata (RECOMMENDED)

Execute **229 SQL manually**, then fix history, then run **229 through `db push`** (idempotent second pass).

```
┌─────────────────────────────────────────────────────────────┐
│ 1. db query -f 229_production_recovery.sql   (schema live)  │
│ 2. Validate core objects exist                              │
│ 3. migration repair 215–228 → applied   (skip broken chain) │
│ 4. db push --linked                         (runs 229 only) │
└─────────────────────────────────────────────────────────────┘
```

**Why 229 runs before 215:** Step 3 marks **215–228 applied** without executing their SQL. Step 4’s runner sees next pending version **229** only. **215 is never invoked.**

**Why Step 1 exists:** Schema is restored **before** metadata changes. If Step 4 fails, production is not left with “215–228 marked applied” and still missing tables.

---

### Strategy 2 — Metadata first, then push 229 (minimal steps)

Skip manual SQL; repair history, then push immediately in the same maintenance window.

```
┌─────────────────────────────────────────────────────────────┐
│ 1. migration repair 215–228 → applied                       │
│ 2. db push --linked immediately           (runs 229 only)   │
└─────────────────────────────────────────────────────────────┘
```

**Why 229 runs before 215:** Same as Strategy 1 Step 4 — **215–228 skipped** in runner; **229 is first (and only) SQL executed.**

**Risk vs Strategy 1:** Between Step 1 and Step 2, `schema_migrations` claims **215–228 applied** but schema is still broken until **229 push completes**. Keep steps adjacent; do not pause.

---

## 3. Recommended plan: Strategy 1 (Schema-first repair)

| Dimension | Assessment |
|-----------|------------|
| **Risk** | Low — idempotent 229; validated locally |
| **Downtime** | Low — DDL mostly online |
| **Rollback** | PITR / backup (see Section 7) |
| **Complexity** | Medium — 4 phases, explicit validation gates |
| **Production safety** | **Highest** — schema before false history |

---

## 4. Why `supabase db query --linked --file` is safe (Strategy 1, Step 1)

### 4.1 What the command does

```bash
pnpm supabase db query --linked \
  --file supabase/migrations/229_production_recovery.sql
```

Executes the SQL file against the **linked production database** via Supabase Management API. It does **not** write to `schema_migrations`.

### 4.2 Safety properties of `229_production_recovery.sql`

| Property | Evidence |
|----------|----------|
| **Idempotent** | `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` |
| **No destructive ops** | No `DROP`, `DELETE`, `TRUNCATE`, or `UPDATE` backfills |
| **Policies** | Wrapped in `pg_policies` existence checks |
| **Triggers** | Wrapped in `pg_trigger` existence checks |
| **Publications** | `duplicate_object` / `undefined_object` exception handlers |
| **226 overlap** | Safe if mis-keyed **214** already added omnichannel tables to realtime |
| **Local proof** | `pnpm supabase db reset` succeeds with **229** in chain; on full schema, 229 mostly no-ops |

### 4.3 Safe to re-run

Strategy 1 runs 229 **twice** (manual query + `db push`). This is **intentional**:

- First run: creates missing objects on broken production.
- Second run: idempotent confirmation; records **229** through migration runner.

### 4.4 Known limitations (not blockers)

| Limitation | Mitigation |
|------------|------------|
| File is **not** wrapped in a single `BEGIN…COMMIT` | Statement-by-statement execution; if mid-file error, run Section 8.2 to find gap, fix blocker, **re-run same file** (idempotent) |
| Omits **215/223/224 data backfills** | Optional Section 6 after schema verified |
| `schema_migrations` unchanged until repair/push | Expected; app may still fail until Step 1 completes |

### 4.5 What would make it **unsafe**

**Do not proceed** if pre-flight shows:

- Git branch **missing** `229_production_recovery.sql` or file differs from reviewed commit.
- Pre-flight catalog shows **215–228 partially applied** outside CLI (investigate before repair).
- File contains `DROP` / `UPDATE` / `DELETE` (regression check — current file has none).

---

## 5. Migration repair — exact commands

Repair inserts/updates rows in `supabase_migrations.schema_migrations`. It does **not** execute migration SQL.

### 5.1 Pre-repair verification

```bash
cd /path/to/ValueOR

pnpm supabase link --project-ref <PRODUCTION_PROJECT_REF>

pnpm supabase migration list --linked
```

Expected **before** repair:

| Versions | Status |
|----------|--------|
| 001–214 | Applied |
| 215–228 | **Pending** |
| 229 | **Pending** |

Dry-run confirms order:

```bash
pnpm supabase db push --linked --dry-run
# Expect: 215, 216, …, 227, 229 (NOT 228 alone first — 228 before 229)
```

### 5.2 Mark 215–228 as applied (single command)

```bash
pnpm supabase migration repair --linked --status applied \
  215 216 217 218 219 220 221 222 223 224 225 226 227
```

CLI accepts multiple `<version>` arguments (see `supabase migration repair --help`).

### 5.3 Post-repair verification

```bash
pnpm supabase migration list --linked
```

Expected **after** repair, **before** push:

| Versions | Status |
|----------|--------|
| 001–228 | Applied |
| 229 | **Pending** |

Dry-run should show **only 229**:

```bash
pnpm supabase db push --linked --dry-run
# Expect: 229 only
```

### 5.4 What repair does **not** do

- Does **not** run `215_ticket_platform_foundation_sprint6_9_2.sql` or any other file body.
- Does **not** fix mis-keyed **214** (leave as-is unless separate decision).
- Does **not** replace Step 1 in Strategy 1 — repair alone does not create `support_tickets`.

### 5.5 Rollback repair (metadata only)

If recovery aborted **after repair** but **before** schema exists:

```bash
pnpm supabase migration repair --linked --status reverted \
  215 216 217 218 219 220 221 222 223 224 225 226 227
```

If **229** was pushed:

```bash
pnpm supabase migration repair --linked --status reverted 229
```

**Note:** Reverting metadata does **not** drop created tables. Schema rollback requires PITR (Section 7).

---

## 6. Step-by-step implementation (Strategy 1)

### Step 1 — Pre-flight (read-only)

Run Section **9.1** SQL against production. Save results.

**STOP if:**

- `229` already applied → investigate; may not need recovery.
- `support_tickets` already exists but 215 pending → different failure mode; do not use this plan blindly.
- Baseline `companies` / `conversations` missing.

---

### Step 2 — Backup

```bash
# Dashboard: Database → Backups → on-demand backup
# OR:
pg_dump "$PRODUCTION_DATABASE_URL" \
  --schema=public \
  --no-owner \
  --file="valueor-prod-pre-recovery-v2-$(date +%Y%m%d-%H%M).sql"
```

Record backup ID / timestamp.

---

### Step 3 — Confirm local chain (developer machine)

```bash
cd /path/to/ValueOR
pnpm supabase db reset
```

Must complete including **229**.

Confirm file hash matches deployed commit:

```bash
git log -1 --oneline -- supabase/migrations/229_production_recovery.sql
```

---

### Step 4 — Execute 229 SQL **before** migration 215 (manual)

```bash
cd /path/to/ValueOR

pnpm supabase db query --linked \
  --file supabase/migrations/229_production_recovery.sql
```

**This is the step that creates `support_tickets`, `leads`, `platform_feature_flags`, etc.**  
Migration **215 has not run** and **must not run** until Step 6 metadata repair skips it.

---

### Step 5 — Validate schema (gate)

Run Section **9.2** quick gate:

```sql
SELECT
  to_regclass('public.support_tickets') IS NOT NULL AS tickets_ok,
  to_regclass('public.leads') IS NOT NULL AS leads_ok,
  to_regclass('public.platform_company_licenses') IS NOT NULL AS licenses_ok,
  to_regclass('public.platform_feature_flags') IS NOT NULL AS flags_ok;
```

**All must be `true`.** If any `false`, **STOP** — do not repair history. Diagnose query output; fix blocker; re-run Step 4 (safe/idempotent).

---

### Step 6 — Repair migration history (skip 215–228)

```bash
pnpm supabase migration repair --linked --status applied \
  215 216 217 218 219 220 221 222 223 224 225 226 227
```

Verify:

```bash
pnpm supabase migration list --linked
pnpm supabase db push --linked --dry-run
```

Dry-run must list **229 only**.

---

### Step 7 — Push 229 through migration runner

```bash
pnpm supabase db push --linked
```

Expected:

- Applies **229_production_recovery.sql** once via official path.
- Idempotent — objects already exist from Step 4.
- Records version **229** in `schema_migrations`.

**215–228 SQL files are never executed** on production.

---

### Step 8 — Full post-recovery validation

Run Section **9.3** (full checklist).

```bash
pnpm supabase migration list --linked
```

Expected final state:

| Versions | Status | SQL executed on prod? |
|----------|--------|---------------------|
| 214 | Applied | **Wrong SQL historically** (unchanged) |
| 215–228 | Applied | **No** — marked via repair only |
| 229 | Applied | **Yes** — Step 4 + Step 7 (idempotent) |

Document this gap in runbook for future clones.

---

### Step 9 — Optional data backfills

Only after Step 8 passes. **Not** in 229.

#### 9a — SLA columns backfill (from 215)

Only if `support_tickets` has rows with NULL SLA:

```sql
UPDATE public.support_tickets
SET sla_due_at = CASE priority
  WHEN 'urgent' THEN created_at + interval '4 hours'
  WHEN 'high' THEN created_at + interval '8 hours'
  WHEN 'low' THEN created_at + interval '72 hours'
  ELSE created_at + interval '24 hours'
END
WHERE sla_due_at IS NULL
  AND deleted_at IS NULL
  AND status IN ('open', 'in_progress', 'waiting_customer');

UPDATE public.support_tickets
SET resolved_at = closed_at
WHERE resolved_at IS NULL
  AND closed_at IS NOT NULL
  AND status IN ('resolved', 'closed');
```

#### 9b — Plan entitlements + company licenses (from 224)

Run `INSERT … SELECT` blocks from `224_feature_flags_and_licensing_ga1_4.sql` (lines 102–149) only if tables are empty:

```sql
SELECT count(*) FROM public.platform_plan_entitlements;
SELECT count(*) FROM public.platform_company_licenses;
```

#### 9c — Config migration (from 223)

Run `INSERT INTO platform_configurations SELECT FROM operations_workspace_config` from `223_ga1_4_enterprise_configuration_platform.sql` (lines 77–108) only if ops config has rows and platform_configurations does not.

---

### Step 10 — Application smoke test

- [ ] Omnichannel inbox + realtime
- [ ] Leads API (no PGRST205)
- [ ] Support tickets API
- [ ] Feature flags / licenses endpoints
- [ ] Appointment metrics RPC

---

## 7. Strategy 2 condensed procedure

Use only if team accepts **no manual SQL** and executes Steps 1–2 with zero delay between repair and push.

```bash
# After backup + pre-flight:

pnpm supabase migration repair --linked --status applied \
  215 216 217 218 219 220 221 222 223 224 225 226 227

pnpm supabase db push --linked   # MUST run immediately
```

Skip Step 4 manual query. **229 push is the sole schema restore.**

Same validation as Steps 8–10.

---

## 8. Rollback

### 8.1 If Step 4 (db query) fails mid-file

1. Capture error message + statement number if available.
2. Run Section 9.2 gate — see what **was** created.
3. Fix root cause (missing prerequisite, permission, etc.).
4. Re-run Step 4 (idempotent).

### 8.2 If Step 7 (push) fails after repair

1. **Do not** run 215–228 manually.
2. Schema may already be complete from Step 4.
3. Fix push error (often timeout — retry push).
4. If 229 partially recorded, check `schema_migrations` before retry.

### 8.3 Full revert

1. Restore Supabase backup / PITR to pre-recovery timestamp.
2. Verify `schema_migrations` shows only **214** applied (215–229 absent).
3. Re-run Section 9.1.

### 8.4 Revert metadata only (does not undo schema)

```bash
pnpm supabase migration repair --linked --status reverted \
  215 216 217 218 219 220 221 222 223 224 225 226 227 229
```

---

## 9. Validation SQL

### 9.1 Pre-flight

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '214'
ORDER BY version;

SELECT
  to_regclass('public.support_tickets') AS support_tickets,
  to_regclass('public.leads') AS leads,
  to_regclass('public.platform_company_licenses') AS platform_company_licenses,
  to_regclass('public.platform_feature_flags') AS platform_feature_flags,
  to_regclass('public.companies') AS companies,
  to_regclass('public.conversations') AS conversations;

SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('conversations', 'conversation_messages', 'channel_sessions')
ORDER BY tablename;
```

### 9.2 Gate after Step 4 (before repair)

```sql
SELECT
  to_regclass('public.support_tickets') IS NOT NULL AS tickets_ok,
  to_regclass('public.leads') IS NOT NULL AS leads_ok,
  to_regclass('public.platform_company_licenses') IS NOT NULL AS licenses_ok,
  to_regclass('public.platform_feature_flags') IS NOT NULL AS flags_ok,
  to_regclass('public.handoff_queues') IS NOT NULL AS handoff_ok,
  to_regclass('public.entity_contacts') IS NOT NULL AS entities_ok;
```

**Do not proceed to Step 6 unless all `true`.**

### 9.3 Post-recovery (full)

```sql
-- History
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('214','215','228','229')
ORDER BY version;

-- Core objects
SELECT
  to_regclass('public.support_tickets') IS NOT NULL AS tickets_ok,
  to_regclass('public.leads') IS NOT NULL AS leads_ok,
  to_regclass('public.platform_company_licenses') IS NOT NULL AS licenses_ok,
  to_regclass('public.platform_feature_flags') IS NOT NULL AS flags_ok,
  to_regclass('public.platform_configurations') IS NOT NULL AS config_ok,
  to_regclass('public.platform_event_audit') IS NOT NULL AS events_ok;

-- Functions
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'ticket_platform_company_metrics_v1',
    'handoff_platform_company_metrics_v1',
    'lead_platform_company_metrics_v1',
    'appointment_platform_company_metrics_v1'
  )
ORDER BY proname;

-- 219 + 227 columns
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'conversations' AND column_name = 'lead_id')
    OR (table_name = 'scheduling_bookings' AND column_name IN ('lead_id','conversation_id'))
  )
ORDER BY 1, 2;

-- RLS
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('support_tickets','leads','platform_feature_flags','platform_company_licenses')
ORDER BY 1;
```

### 9.4 CLI final check

```bash
pnpm supabase migration list --linked
pnpm supabase db push --linked --dry-run
```

Expected: **no pending migrations**.

---

## 10. Why we do NOT run 215–228 on production

| Migration | Would fail or conflict if run after 229 |
|-----------|----------------------------------------|
| **215** | Originally failed — needs `support_tickets` (229 creates it, but repair skips 215 anyway) |
| **217–225** | Bare `CREATE POLICY` → **42710 already exists** after 229 |
| **220** | `DROP POLICY` / `DROP TRIGGER` patterns — destructive |
| **226** | Duplicate publication — handled in 226 file, but redundant |
| **224** | Data backfills — run optionally in Step 9, not via migration replay |

229 is the **canonical DDL substitute** for 215–227 schema. Repair marks those versions applied to align metadata with “schema delivered via 229.”

---

## 11. Final metadata truth table (after Strategy 1)

| Version | In `schema_migrations` | Migration file SQL executed? | Schema source |
|---------|------------------------|------------------------------|---------------|
| 214 | Applied | **Historical wrong SQL** | Omnichannel realtime (mis-keyed) |
| 215–228 | Applied (repaired) | **No** | — |
| 229 | Applied (pushed) | **Yes** (×2 idempotent with Step 4) | Full 214–227 DDL recovery |

---

## 12. Sign-off

| Step | Owner | Date | OK |
|------|-------|------|-----|
| Pre-flight 9.1 reviewed | | | ☐ |
| Backup confirmed | | | ☐ |
| Strategy 1 vs 2 chosen | | | ☐ |
| Step 4 gate 9.2 passed | | | ☐ |
| Repair + push completed | | | ☐ |
| Post-recovery 9.3 passed | | | ☐ |
| Smoke tests passed | | | ☐ |

**No production changes until all review items complete.**
