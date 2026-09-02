/**
 * Phase 2H.12 post-apply verification + portal tenant isolation (rollback).
 * No persistent customer writes. No messages.
 *
 * Run: node scripts/verify-332-customer-phone-identity-foundation.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const report = { ok: false, checks: {}, portal: {}, counts: {} };

function assert(name, cond, detail = null) {
  report.checks[name] = { ok: Boolean(cond), detail };
  if (!cond) throw new Error(`CHECK FAILED: ${name} ${detail ?? ""}`);
}

await client.connect();
try {
  // Schema columns
  const cols = await client.query(
    `select column_name, is_nullable, data_type
     from information_schema.columns
     where table_schema='public' and table_name='customers'
       and column_name in ('phone','phone_e164','phone_country_iso','phone_region_source','phone_national')
     order by column_name`,
  );
  const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
  assert("phone_exists", Boolean(byName.phone));
  for (const c of ["phone_e164", "phone_country_iso", "phone_region_source", "phone_national"]) {
    assert(`${c}_exists`, Boolean(byName[c]));
    assert(`${c}_nullable`, byName[c]?.is_nullable === "YES", byName[c]);
  }

  // Constraints
  const cons = await client.query(
    `select conname, pg_get_constraintdef(oid) as def
     from pg_constraint
     where conrelid = 'public.customers'::regclass
       and conname in (
         'customers_phone_e164_format_check',
         'customers_phone_country_iso_check',
         'customers_phone_region_source_check'
       )
     order by conname`,
  );
  const conMap = Object.fromEntries(cons.rows.map((r) => [r.conname, r.def]));
  assert("phone_e164_check", Boolean(conMap.customers_phone_e164_format_check));
  assert("country_iso_check", Boolean(conMap.customers_phone_country_iso_check));
  assert("region_source_check", Boolean(conMap.customers_phone_region_source_check));

  // Indexes
  const idx = await client.query(
    `select indexname, indexdef from pg_indexes
     where schemaname='public' and tablename='customers'
       and indexname in (
         'idx_customers_company_phone_unique',
         'idx_customers_company_phone_e164_unique',
         'idx_customers_company_phone_e164'
       )`,
  );
  const idxMap = Object.fromEntries(idx.rows.map((r) => [r.indexname, r.indexdef]));
  assert("raw_phone_unique_preserved", Boolean(idxMap.idx_customers_company_phone_unique));
  assert(
    "e164_partial_unique",
    Boolean(idxMap.idx_customers_company_phone_e164_unique) &&
      /UNIQUE/i.test(idxMap.idx_customers_company_phone_e164_unique) &&
      /company_id/i.test(idxMap.idx_customers_company_phone_e164_unique),
    idxMap.idx_customers_company_phone_e164_unique,
  );
  assert("e164_lookup_index", Boolean(idxMap.idx_customers_company_phone_e164));

  // RLS
  const rls = await client.query(
    `select relrowsecurity from pg_class where oid='public.customers'::regclass`,
  );
  assert("customers_rls_enabled", rls.rows[0]?.relrowsecurity === true);

  // No backfill: all derived cols null
  const filled = await client.query(
    `select count(*)::int as n from public.customers
     where phone_e164 is not null
        or phone_country_iso is not null
        or phone_region_source is not null
        or phone_national is not null`,
  );
  assert("no_backfill_derived_null", filled.rows[0].n === 0, filled.rows[0]);

  // Valid auth.users id for disposable inserts (never persisted — always rolled back)
  const ownerRow = await client.query(
    `select user_id from public.customers where user_id is not null limit 1`,
  );
  const validUserId = ownerRow.rows[0]?.user_id;
  assert("valid_user_id_for_txn_tests", Boolean(validUserId), ownerRow.rows[0]);

  // Constraint behavior (rollback)
  await client.query("begin");
  try {
    await client.query(
      `insert into public.customers (id, user_id, name, phone, phone_e164)
       values ($1, $2, 'tmp-invalid-e164', null, 'not-e164')`,
      [randomUUID(), validUserId],
    );
    assert("reject_invalid_e164", false, "should have thrown");
  } catch (e) {
    assert("reject_invalid_e164", /phone_e164|check/i.test(String(e.message)), e.message);
  }
  await client.query("rollback");

  await client.query("begin");
  try {
    await client.query(
      `insert into public.customers (id, user_id, name, phone, phone_country_iso)
       values ($1, $2, 'tmp-invalid-iso', null, 'egy')`,
      [randomUUID(), validUserId],
    );
    assert("reject_invalid_iso", false);
  } catch (e) {
    assert("reject_invalid_iso", /phone_country_iso|check/i.test(String(e.message)), e.message);
  }
  await client.query("rollback");

  await client.query("begin");
  try {
    await client.query(
      `insert into public.customers (id, user_id, name, phone, phone_region_source)
       values ($1, $2, 'tmp-invalid-source', null, 'guess')`,
      [randomUUID(), validUserId],
    );
    assert("reject_invalid_region_source", false);
  } catch (e) {
    assert(
      "reject_invalid_region_source",
      /phone_region_source|check/i.test(String(e.message)),
      e.message,
    );
  }
  await client.query("rollback");

  // Portal function scope
  const fn = await client.query(
    `select pg_get_functiondef(p.oid) as d
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='internal' and p.proname='portal_verify_auth_challenge'`,
  );
  const def = fn.rows[0]?.d ?? "";
  assert(
    "portal_verify_company_scoped",
    /company_id\s*=\s*v_challenge\.company_id/i.test(def),
  );
  assert(
    "portal_verify_no_global_phone_lookup",
    !/from public\.customers where phone = v_challenge\.destination or email = v_challenge\.destination limit 1/i.test(
      def,
    ),
  );

  // Portal isolation (all rolled back).
  // Insert challenges directly — avoids portal_start digest/search_path issues and sends no messages.
  await client.query("begin");
  const custA = randomUUID();
  const custB = randomUUID();

  // Two real companies that already have customers (valid auth.users FKs)
  const cos = await client.query(
    `select c.id,
            (select cu.user_id from public.customers cu where cu.company_id = c.id limit 1) as user_id
     from public.companies c
     where exists (select 1 from public.customers cu where cu.company_id = c.id)
     order by c.id
     limit 2`,
  );
  if (cos.rowCount < 2) {
    report.portal = { skipped: true, reason: "need_two_companies_with_customers" };
    assert("portal_same_company_resolves", false, report.portal);
  } else {
    const coA = cos.rows[0].id;
    const coB = cos.rows[1].id;
    const userA = cos.rows[0].user_id;
    const userB = cos.rows[1].user_id;
    const phone = `015${String(Date.now()).slice(-8)}`;
    const emailA = `a-2h12-${Date.now()}@example.test`;
    const emailB = `b-2h12-${Date.now()}@example.test`;

    const insA = await client.query(
      `insert into public.customers (id, company_id, user_id, name, phone, email)
       values ($1, $2, $3, '2h12-portal-a', $4, $5)
       returning id`,
      [custA, coA, userA, phone, emailA],
    );
    const insB = await client.query(
      `insert into public.customers (id, company_id, user_id, name, phone, email)
       values ($1, $2, $3, '2h12-portal-b', $4, $5)
       returning id`,
      [custB, coB, userB, phone, emailB],
    );

    async function insertChallenge(companyId, method, destination, code) {
      const id = randomUUID();
      await client.query(
        `insert into public.customer_portal_auth_challenges
           (id, company_id, method, destination, code_hash, expires_at)
         values (
           $1, $2, $3, $4,
           encode(extensions.digest($5::text, 'sha256'), 'hex'),
           now() + interval '10 minutes'
         )`,
        [id, companyId, method, destination, code],
      );
      return id;
    }

    // Same-company: Company A challenge for shared phone resolves to A's customer
    const codeA = "111111";
    const challengeA = await insertChallenge(coA, "otp", phone, codeA);
    const okA = await client.query(
      `select public.portal_verify_auth_challenge($1::uuid, $2) as r`,
      [challengeA, codeA],
    );
    report.portal.sameCompany = {
      customerId: okA.rows[0].r.customer_id,
      companyId: okA.rows[0].r.company_id,
      expectedCustomer: insA.rows[0].id,
      expectedCompany: coA,
    };
    assert(
      "portal_same_company_resolves",
      okA.rows[0].r.customer_id === insA.rows[0].id &&
        okA.rows[0].r.company_id === coA,
      report.portal.sameCompany,
    );

    // Cross-tenant: Company A challenge for B-only email must not resolve B
    const codeCross = "222222";
    const challengeCross = await insertChallenge(coA, "otp", emailB, codeCross);
    let crossFailed = false;
    let crossErr = null;
    await client.query("savepoint portal_cross");
    try {
      await client.query(`select public.portal_verify_auth_challenge($1::uuid, $2) as r`, [
        challengeCross,
        codeCross,
      ]);
    } catch (e) {
      crossFailed = true;
      crossErr = e instanceof Error ? e.message : String(e);
      await client.query("rollback to savepoint portal_cross");
    }
    report.portal.crossTenant = { failed: crossFailed, error: crossErr };
    assert(
      "portal_cross_tenant_blocked",
      crossFailed && /Customer not found/i.test(String(crossErr)),
      report.portal.crossTenant,
    );

    // Company B can resolve its own email
    const codeB = "333333";
    const challengeB = await insertChallenge(coB, "otp", emailB, codeB);
    const okB = await client.query(
      `select public.portal_verify_auth_challenge($1::uuid, $2) as r`,
      [challengeB, codeB],
    );
    report.portal.companyBOwn = {
      customerId: okB.rows[0].r.customer_id,
      expected: insB.rows[0].id,
    };
    assert(
      "portal_company_b_own_resolves",
      okB.rows[0].r.customer_id === insB.rows[0].id,
      report.portal.companyBOwn,
    );
  }
  await client.query("rollback");

  // Counts
  for (const t of [
    "customers",
    "marketing_campaigns",
    "marketing_campaign_recipients",
    "notification_queue",
    "channel_delivery_events",
  ]) {
    const r = await client.query(`select count(*)::int as n from public.${t}`);
    report.counts[t] = r.rows[0].n;
  }

  // Migration registered
  const mig = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = '332'`,
  );
  assert("migration_332_registered", mig.rowCount === 1, mig.rows[0]);

  // Partial unique: two companies can share same e164 (in txn)
  await client.query("begin");
  const cos2 = await client.query(
    `select c.id,
            (select cu.user_id from public.customers cu where cu.company_id = c.id limit 1) as user_id
     from public.companies c
     where exists (select 1 from public.customers cu where cu.company_id = c.id)
     order by c.id
     limit 2`,
  );
  if (cos2.rowCount >= 2) {
    const e164 = `+2010${String(Date.now()).slice(-8)}`;
    await client.query(
      `insert into public.customers (id, company_id, user_id, name, phone, phone_e164)
       values ($1, $2, $3, '2h12-e164-a', null, $4)`,
      [randomUUID(), cos2.rows[0].id, cos2.rows[0].user_id, e164],
    );
    await client.query(
      `insert into public.customers (id, company_id, user_id, name, phone, phone_e164)
       values ($1, $2, $3, '2h12-e164-b', null, $4)`,
      [randomUUID(), cos2.rows[1].id, cos2.rows[1].user_id, e164],
    );
    assert("cross_company_same_e164_allowed", true);

    // Same company cannot share same e164
    let sameCoDupBlocked = false;
    await client.query("savepoint e164_dup");
    try {
      await client.query(
        `insert into public.customers (id, company_id, user_id, name, phone, phone_e164)
         values ($1, $2, $3, '2h12-e164-dup', null, $4)`,
        [randomUUID(), cos2.rows[0].id, cos2.rows[0].user_id, e164],
      );
    } catch (e) {
      sameCoDupBlocked = /unique|duplicate|phone_e164/i.test(String(e.message));
      report.checks.same_company_e164_unique = { ok: sameCoDupBlocked, detail: e.message };
      await client.query("rollback to savepoint e164_dup");
    }
    assert("same_company_e164_unique", sameCoDupBlocked);
  }
  await client.query("rollback");

  report.ok = true;
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await client.end();
  writeFileSync(resolve(root, "scripts/_tmp-2h12-verify-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
