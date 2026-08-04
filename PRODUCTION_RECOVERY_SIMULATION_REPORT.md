# Production Recovery — Local Simulation Report

**Date:** 2026-08-05  
**Procedure:** RECOVERY_PLAN_v2 Strategy 1 (229 → repair → db push)  
**Environment:** Local Supabase (`supabase_db_project`)  
**Migration file:** `supabase/migrations/229_production_recovery.sql`  

---

## Verdict

# ✅ RECOVERY PRODUCTION-SAFE

All validation gates passed. The Strategy 1 sequence successfully restored a production-diverged local database without executing migrations **215–228** SQL and without errors on second-pass **229** via `db push`.

---

## Simulation setup

| Step | Action | Result |
|------|--------|--------|
| Baseline | `pnpm supabase db reset` | Clean DB through migration **229** |
| Metadata | `migration repair --local --status reverted 215…229` | History matches production: **214 only** |
| Schema divergence | Drop missing production objects (see below) | All four core objects **NULL** |
| Pre-check | `support_tickets \| leads \| flags \| licenses` | `NULL\|NULL\|NULL\|NULL` ✓ |
| History check | `schema_migrations >= 214` | **214** only ✓ |

### Objects removed (production-missing)

Script: `scripts/simulate-production-divergence.sql`

| Object | Removed |
|--------|---------|
| `support_ticket_comments` | ✓ DROP |
| `support_tickets` | ✓ DROP |
| `support_ticket_number_seq` | ✓ DROP |
| `platform_feature_flag_versions` | ✓ DROP (FK dep) |
| `platform_feature_flags` | ✓ DROP |
| `platform_company_licenses` | ✓ DROP |
| `leads` + 7 child tables | ✓ DROP CASCADE |
| `conversations.lead_id` | ✓ DROP COLUMN |
| `scheduling_bookings.lead_id/conversation_id` | ✓ DROP COLUMN |

**Note:** Dropping `leads` required child tables and FK columns — expected for a realistic simulation.

---

## Recovery execution (exact sequence)

### Step 1 — Execute **229**

```bash
# Local (used docker psql — see CLI note below)
docker cp supabase/migrations/229_production_recovery.sql supabase_db_project:/tmp/229_production_recovery.sql
docker exec supabase_db_project psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/229_production_recovery.sql
```

| Check | Result |
|-------|--------|
| Exit code | **0** |
| Gate: `support_tickets` | **true** |
| Gate: `leads` | **true** |
| Gate: `platform_company_licenses` | **true** |
| Gate: `platform_feature_flags` | **true** |

Migration **215 was not executed.** Schema restored before metadata repair.

---

### Step 2 — **repair**

```bash
pnpm supabase migration repair --local --status applied \
  215 216 217 218 219 220 221 222 223 224 225 226 227
```

| Check | Result |
|-------|--------|
| Versions marked applied | **215–227** |
| **215 SQL executed?** | **No** (repair only) |

---

### Step 3 — **db push**

```bash
pnpm supabase db push --local --dry-run
# → Would push: 229_production_recovery.sql ONLY

pnpm supabase db push --local --yes
# → Finished successfully (exit 0)
```

| Check | Result |
|-------|--------|
| Migrations pushed | **229 only** (not 215) |
| Second-pass idempotency | All NOTICEs `already exists, skipping` — **no errors** |
| Exit code | **0** |

---

## Final validation

### Migration history

```
214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 229
```

| Version | SQL executed on DB? |
|---------|---------------------|
| 214 | Yes (historical, from reset) |
| 215–227 | **No** — repair metadata only |
| 229 | **Yes** — psql (step 1) + db push (step 3, idempotent) |

### Core objects

| Object | Exists | RLS enabled |
|--------|:------:|:-----------:|
| `support_tickets` | ✓ | ✓ |
| `leads` | ✓ | ✓ |
| `platform_company_licenses` | ✓ | ✓ |
| `platform_feature_flags` | ✓ | ✓ |
| `handoff_queues` | ✓ | — |
| `entity_contacts` | ✓ | — |

### Metrics functions

All **4** present:

- `ticket_platform_company_metrics_v1`
- `handoff_platform_company_metrics_v1`
- `lead_platform_company_metrics_v1`
- `appointment_platform_company_metrics_v1`

### Identity columns (219 / 227)

| Table | Column |
|-------|--------|
| `conversations` | `lead_id` |
| `scheduling_bookings` | `lead_id` |
| `scheduling_bookings` | `conversation_id` |

### Pending migrations

```bash
pnpm supabase db push --local --dry-run
# → Local database is up to date.
```

---

## CLI finding — production execution note

### ❌ `supabase db query --linked --file` (multi-statement)

**Failed** in simulation v1:

```
failed to execute query: error: cannot insert multiple commands into a prepared statement
```

The Supabase CLI `db query -f` path does **not** support multi-statement SQL files (~3830 lines in 229).

### ✅ Workaround verified

Use **psql** against the database connection string (local simulation used `docker exec … psql -f`).

**Production equivalent:**

```bash
psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/229_production_recovery.sql
```

Or Supabase Dashboard → SQL Editor (paste/run file).

This does **not** invalidate production-safety — it only changes **how** step 1 is delivered. Idempotency audit (`229_IDEMPOTENCY_AUDIT.md`) confirms safe re-execution.

---

## Failed attempt (v1) — not counted

| Issue | Impact |
|-------|--------|
| `db query --file` multi-statement error | Drop + 229 manual steps did not run |
| Recovery continued with objects still present | Invalid partial test |

**v2** (this report) is the authoritative simulation.

---

## Production deployment checklist

1. Backup production database
2. Pre-flight queries (RECOVERY_PLAN_v2 §9.1)
3. **229 via psql** (not `db query --file`)
4. Gate validation (all four objects exist)
5. `supabase migration repair --linked --status applied 215…227`
6. `supabase db push --linked --yes` (229 only)
7. Post-recovery validation (RECOVERY_PLAN_v2 §9.3)
8. Optional data backfills (215 SLA, 224 licenses)

---

## Sign-off

| Criterion | Status |
|-----------|--------|
| Production metadata simulated (214 only before recovery) | ✓ |
| Production-missing objects removed | ✓ |
| 229 restores schema before 215 can run | ✓ |
| repair skips 215–228 SQL | ✓ |
| db push applies 229 only | ✓ |
| All validation queries pass | ✓ |
| Idempotent second pass (db push) | ✓ |

**Declared: RECOVERY PRODUCTION-SAFE** under RECOVERY_PLAN_v2 Strategy 1, using **psql** (or SQL Editor) for step 1 instead of `supabase db query --file`.

Raw log: `PRODUCTION_RECOVERY_SIMULATION_REPORT.txt`
