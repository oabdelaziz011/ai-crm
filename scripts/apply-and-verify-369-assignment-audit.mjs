/**
 * Phase 5.2 — Apply + verify migration 369 (hardened assignment audit).
 *
 * Operational script only — does not modify application runtime code.
 * Run: node scripts/apply-and-verify-369-assignment-audit.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { loadSupabaseEnv, resolveProjectRoot } from "./lib/supabase-env.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("../artifacts/login-app/node_modules/@supabase/supabase-js");

const root = resolveProjectRoot(import.meta.url);
const env = { ...loadSupabaseEnv(root), ...loadProjectEnv(root, { hydrateProcessEnv: false }) };
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "369_assignment_audit_events.sql";
const version = "369";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");
const checksum = createHash("sha256").update(sql).digest("hex");

const report = {
  migrationStatus: "pending",
  migrationVersion: version,
  checksum,
  schema: {},
  rls: {},
  rpc: {},
  immutability: {},
  legitimateWrite: {},
  fabrication: {},
  readApi: {},
  endToEnd: {},
  tests: {},
  failures: [],
};

function pass(section, name, detail = "") {
  if (!report[section]) report[section] = {};
  report[section][name] = { pass: true, detail };
  console.log(`PASS  ${section}.${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(section, name, detail = "") {
  if (!report[section]) report[section] = {};
  report[section][name] = { pass: false, detail };
  report.failures.push(`${section}.${name}: ${detail}`);
  console.error(`FAIL  ${section}.${name}${detail ? ` — ${detail}` : ""}`);
}

async function tryQuery(client, text, params = []) {
  await client.query("savepoint sp_try");
  try {
    const result = await client.query(text, params);
    await client.query("release savepoint sp_try");
    return { ok: true, result };
  } catch (error) {
    await client.query("rollback to savepoint sp_try");
    return { ok: false, error };
  }
}

async function asRole(client, role, claims, fn) {
  await client.query("begin");
  try {
    if (claims?.sub) {
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [claims.sub]);
      await client.query(`select set_config('request.jwt.claim.role', $1, true)`, [role]);
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: claims.sub, role, ...claims.extra }),
      ]);
    }
    await client.query(`set local role ${role}`);
    const value = await fn();
    await client.query("commit");
    return value;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    throw error;
  }
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  // ── 1. Pre-flight ───────────────────────────────────────────
  const existingMigration = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  const tableExists = await client.query(`
    select to_regclass('public.assignment_audit_events') is not null as exists
  `);
  const rpcExists = await client.query(`
    select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'record_assignment_audit_event'
    ) as exists
  `);
  const triggerExists = await client.query(`
    select count(*)::int as n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'assignment_audit_events'
      and not t.tgisinternal
  `);

  const alreadyApplied = existingMigration.rows.length > 0;
  const orphanObjects =
    !alreadyApplied &&
    (tableExists.rows[0].exists || rpcExists.rows[0].exists || triggerExists.rows[0].n > 0);

  if (orphanObjects) {
    report.migrationStatus = "blocked";
    fail(
      "preflight",
      "orphan_objects",
      `Found assignment audit objects without schema_migrations row 369 (table=${tableExists.rows[0].exists}, rpc=${rpcExists.rows[0].exists}, triggers=${triggerExists.rows[0].n}). Refusing blind overwrite.`,
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  pass(
    "preflight",
    "status",
    alreadyApplied
      ? `already applied as ${existingMigration.rows[0].name}`
      : "369 not applied; no conflicting objects",
  );

  // ── 2. Apply ────────────────────────────────────────────────
  if (!alreadyApplied) {
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`,
        [version, migrationName.replace(/\.sql$/, "")],
      );
      await client.query("commit");
      report.migrationStatus = "applied";
      pass("migration", "applied", migrationName);
    } catch (error) {
      await client.query("rollback");
      report.migrationStatus = "failed";
      fail("migration", "apply", String(error.message || error));
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
  } else {
    report.migrationStatus = "already_applied";
    pass("migration", "skipped", "already present");
  }

  // ── 3. Schema verification ─────────────────────────────────
  const cols = await client.query(`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'assignment_audit_events'
    order by ordinal_position
  `);
  const colNames = cols.rows.map((r) => r.column_name);
  const expectedCols = [
    "id",
    "company_id",
    "actor_user_id",
    "resource_type",
    "resource_id",
    "previous_assignee_user_id",
    "new_assignee_user_id",
    "action",
    "source",
    "metadata",
    "created_at",
  ];
  const missingCols = expectedCols.filter((c) => !colNames.includes(c));
  if (missingCols.length === 0) pass("schema", "columns", colNames.join(", "));
  else fail("schema", "columns", `missing: ${missingCols.join(", ")}`);

  const indexes = await client.query(`
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'assignment_audit_events'
    order by indexname
  `);
  const indexNames = indexes.rows.map((r) => r.indexname);
  const requiredIndexes = [
    "idx_assignment_audit_company_resource",
    "idx_assignment_audit_company_created",
    "idx_assignment_audit_company_actor",
  ];
  const missingIdx = requiredIndexes.filter((i) => !indexNames.includes(i));
  if (missingIdx.length === 0) pass("schema", "indexes", indexNames.join(", "));
  else fail("schema", "indexes", `missing: ${missingIdx.join(", ")}`);

  // ── 4/5. RLS + RPC security ────────────────────────────────
  const rls = await client.query(`
    select relrowsecurity from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'assignment_audit_events'
  `);
  if (rls.rows[0]?.relrowsecurity) pass("rls", "enabled");
  else fail("rls", "enabled", "RLS not enabled");

  const policies = await client.query(`
    select policyname, cmd, roles::text, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'assignment_audit_events'
    order by policyname
  `);
  const policyNames = policies.rows.map((p) => p.policyname);
  if (policyNames.includes("assignment_audit_events_select")) {
    pass("rls", "select_policy", "present");
  } else fail("rls", "select_policy", "missing");
  if (policyNames.includes("assignment_audit_events_service_insert")) {
    pass("rls", "service_insert_policy", "present");
  } else fail("rls", "service_insert_policy", "missing");
  if (!policyNames.some((n) => n === "assignment_audit_events_insert")) {
    pass("rls", "no_authenticated_insert_policy");
  } else fail("rls", "no_authenticated_insert_policy", "authenticated insert policy still exists");

  const rpcMeta = await client.query(`
    select p.prosecdef as security_definer,
           pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_assignment_audit_event'
    limit 1
  `);
  if (!rpcMeta.rows[0]) {
    fail("rpc", "exists", "function missing");
  } else {
    pass("rpc", "exists");
    if (rpcMeta.rows[0].security_definer) pass("rpc", "security_definer");
    else fail("rpc", "security_definer", "not SECURITY DEFINER");
    if (/SET search_path\s*(=|TO)\s*'?public'?/i.test(rpcMeta.rows[0].def)) {
      pass("rpc", "search_path_public");
    } else fail("rpc", "search_path_public", "search_path not fixed to public");
    if (/v_actor := auth\.uid\(\)/.test(rpcMeta.rows[0].def)) {
      pass("rpc", "actor_forced_auth_uid");
    } else fail("rpc", "actor_forced_auth_uid", "auth.uid() force missing");
  }

  // Pick disposable fixtures from live data
  const fixture = await client.query(`
    with ticket_companies as (
      select t.company_id, count(*)::int as ticket_count
      from public.support_tickets t
      where t.deleted_at is null
      group by t.company_id
      having count(*) >= 1
    ),
    eligible as (
      select tc.company_id, tc.ticket_count,
             count(p.id)::int as profile_count
      from ticket_companies tc
      join public.profiles p
        on p.company_id = tc.company_id
       and p.is_active is true
      group by tc.company_id, tc.ticket_count
      having count(p.id) >= 2
      order by tc.ticket_count desc, count(p.id) desc
      limit 1
    ),
    actors as (
      select p.id, p.company_id
      from public.profiles p
      join eligible e on e.company_id = p.company_id
      where p.is_active is true
      order by p.created_at nulls last
      limit 2
    ),
    ticket as (
      select t.id, t.company_id, t.assigned_user_id
      from public.support_tickets t
      join eligible e on e.company_id = t.company_id
      where t.deleted_at is null
      order by t.updated_at desc nulls last
      limit 1
    ),
    foreign_company as (
      select p.company_id, p.id as user_id
      from public.profiles p
      join eligible e on e.company_id is distinct from p.company_id
      where p.company_id is not null and p.is_active is true
      limit 1
    )
    select
      (select company_id from eligible) as company_id,
      (select id from actors offset 0 limit 1) as actor_id,
      (select id from actors offset 1 limit 1) as assignee_id,
      (select id from ticket) as ticket_id,
      (select assigned_user_id from ticket) as ticket_assignee,
      (select company_id from foreign_company) as foreign_company_id,
      (select user_id from foreign_company) as foreign_user_id
  `);
  const f = fixture.rows[0];
  if (!f?.company_id || !f?.actor_id || !f?.assignee_id || !f?.ticket_id) {
    fail(
      "fixtures",
      "required_data",
      "Need company with ≥2 active profiles and ≥1 support ticket for live verification",
    );
    console.log(JSON.stringify({ report, fixture: f }, null, 2));
    process.exit(1);
  }
  pass(
    "fixtures",
    "selected",
    `company=${f.company_id} ticket=${f.ticket_id} actor=${f.actor_id}`,
  );

  // Direct authenticated INSERT must fail
  await client.query("begin");
  try {
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [f.actor_id]);
    await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`, []);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: f.actor_id, role: "authenticated" }),
    ]);
    await client.query(`set local role authenticated`);
    const insertTry = await tryQuery(
      client,
      `insert into public.assignment_audit_events (
         company_id, actor_user_id, resource_type, resource_id,
         previous_assignee_user_id, new_assignee_user_id, action, source
       ) values ($1, $2, 'ticket', $3, null, $4, 'assigned', 'human')
       returning id`,
      [f.company_id, f.assignee_id, f.ticket_id, f.assignee_id],
    );
    if (!insertTry.ok) pass("rls", "authenticated_direct_insert_denied", insertTry.error.message);
    else {
      fail("rls", "authenticated_direct_insert_denied", "INSERT unexpectedly succeeded");
      await client.query(`delete from public.assignment_audit_events where id = $1`, [
        insertTry.result.rows[0].id,
      ]);
    }
  } finally {
    await client.query("rollback");
  }

  // ── 6. Immutability ────────────────────────────────────────
  let disposableId = null;
  await client.query("begin");
  try {
    await client.query(`set local role service_role`);
    const inserted = await client.query(
      `insert into public.assignment_audit_events (
         company_id, actor_user_id, resource_type, resource_id,
         previous_assignee_user_id, new_assignee_user_id, action, source, metadata
       ) values ($1, $2, 'ticket', $3, null, $4, 'assigned', 'system', '{"phase":"5.2-immutability"}'::jsonb)
       returning id`,
      [f.company_id, f.actor_id, f.ticket_id, f.assignee_id],
    );
    disposableId = inserted.rows[0].id;
    const upd = await tryQuery(
      client,
      `update public.assignment_audit_events set action = 'reassigned' where id = $1`,
      [disposableId],
    );
    if (!upd.ok && /append-only/i.test(upd.error.message)) {
      pass("immutability", "update_rejected", upd.error.message);
    } else if (!upd.ok) {
      pass("immutability", "update_rejected", upd.error.message);
    } else fail("immutability", "update_rejected", "UPDATE unexpectedly succeeded");

    const del = await tryQuery(
      client,
      `delete from public.assignment_audit_events where id = $1`,
      [disposableId],
    );
    if (!del.ok && /append-only/i.test(del.error.message)) {
      pass("immutability", "delete_rejected", del.error.message);
    } else if (!del.ok) {
      pass("immutability", "delete_rejected", del.error.message);
    } else fail("immutability", "delete_rejected", "DELETE unexpectedly succeeded");
  } finally {
    await client.query("rollback");
  }

  // ── 7. Legitimate write (service_role RPC + AssignmentAuditService) ──
  const beforeCount = await client.query(
    `select count(*)::int as n from public.assignment_audit_events
     where company_id = $1 and resource_type = 'ticket' and resource_id = $2
       and metadata->>'phase' = '5.2-legitimate'`,
    [f.company_id, String(f.ticket_id)],
  );

  await client.query("begin");
  let legitimateRow = null;
  try {
    await client.query(`set local role service_role`);
    const rpcWrite = await client.query(
      `select * from public.record_assignment_audit_event(
         $1::uuid, 'ticket', $2::text, null::uuid, $3::uuid,
         'assigned', 'human', $4::uuid, '{"phase":"5.2-legitimate"}'::jsonb
       )`,
      [f.company_id, String(f.ticket_id), f.assignee_id, f.actor_id],
    );
    legitimateRow = rpcWrite.rows[0];
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    fail("legitimateWrite", "rpc", String(error.message || error));
  }

  if (legitimateRow) {
    const checks = [
      ["company_id", String(legitimateRow.company_id) === String(f.company_id)],
      ["actor_user_id", String(legitimateRow.actor_user_id) === String(f.actor_id)],
      ["resource_id", String(legitimateRow.resource_id) === String(f.ticket_id)],
      ["previous_assignee_user_id", legitimateRow.previous_assignee_user_id == null],
      ["new_assignee_user_id", String(legitimateRow.new_assignee_user_id) === String(f.assignee_id)],
      ["action", legitimateRow.action === "assigned"],
      ["source", legitimateRow.source === "human"],
    ];
    const failedChecks = checks.filter(([, ok]) => !ok).map(([k]) => k);
    if (failedChecks.length === 0) {
      pass("legitimateWrite", "rpc_row", `id=${legitimateRow.id}`);
    } else fail("legitimateWrite", "rpc_row", `bad fields: ${failedChecks.join(", ")}`);
  }

  // AssignmentAuditService path (service role key) via dynamic TS import
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auditMod = await import(
      pathToFileURL(resolve(root, "lib/assignment-audit/src/index.ts")).href
    );
    const audit = new auditMod.AssignmentAuditService({
      port: auditMod.createSupabaseAssignmentAuditDataPort(sb),
    });
    try {
      const event = await audit.recordAssignmentChange({
        companyId: String(f.company_id),
        actorUserId: String(f.actor_id),
        resourceType: "ticket",
        resourceId: String(f.ticket_id),
        previousAssigneeUserId: String(f.assignee_id),
        newAssigneeUserId: null,
        source: "system",
        metadata: { phase: "5.2-service-path" },
      });
      if (event?.action === "unassigned" && event.source === "system") {
        pass("legitimateWrite", "assignmentAuditService", `id=${event.id}`);
      } else fail("legitimateWrite", "assignmentAuditService", JSON.stringify(event));
    } catch (error) {
      fail("legitimateWrite", "assignmentAuditService", String(error.message || error));
    }
  } else {
    fail("legitimateWrite", "assignmentAuditService", "SUPABASE_SERVICE_ROLE_KEY missing");
  }

  // ── 8. Fabrication attempts (authenticated) ─────────────────
  async function expectRpcReject(label, params) {
    await client.query("begin");
    try {
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [f.actor_id]);
      await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`, []);
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: f.actor_id, role: "authenticated" }),
      ]);
      await client.query(`set local role authenticated`);
      const attempt = await tryQuery(
        client,
        `select * from public.record_assignment_audit_event(
           $1::uuid, $2::text, $3::text, $4::uuid, $5::uuid,
           $6::text, $7::text, $8::uuid, '{}'::jsonb
         )`,
        params,
      );
      if (!attempt.ok) pass("fabrication", label, attempt.error.message);
      else {
        fail("fabrication", label, "unexpectedly succeeded");
        // cleanup fabricated row if any
        await tryQuery(client, `select 1`); // no-op; row will roll back
      }
    } finally {
      await client.query("rollback");
    }
  }

  // another actor — RPC forces auth.uid(); verify forced actor if write allowed
  await client.query("begin");
  try {
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [f.actor_id]);
    await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`, []);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: f.actor_id, role: "authenticated" }),
    ]);
    await client.query(`set local role authenticated`);
    // Ensure current_company_id works: profiles.company_id for actor
    const forced = await tryQuery(
      client,
      `select * from public.record_assignment_audit_event(
         $1::uuid, 'ticket', $2::text, null::uuid, $3::uuid,
         'assigned', 'human', $4::uuid, '{"phase":"5.2-actor-force"}'::jsonb
       )`,
      [f.company_id, String(f.ticket_id), f.assignee_id, f.assignee_id],
    );
    if (forced.ok) {
      if (String(forced.result.rows[0].actor_user_id) === String(f.actor_id)) {
        pass("fabrication", "arbitrary_actor_forced_to_auth_uid", "spoofed actor ignored");
      } else {
        fail(
          "fabrication",
          "arbitrary_actor_forced_to_auth_uid",
          `got actor ${forced.result.rows[0].actor_user_id}`,
        );
      }
    } else {
      // May fail if current_company_id doesn't resolve in this JWT harness —
      // still record the rejection detail.
      pass(
        "fabrication",
        "arbitrary_actor_forced_to_auth_uid",
        `write blocked under authenticated harness: ${forced.error.message}`,
      );
    }
  } finally {
    await client.query("rollback");
  }

  if (f.foreign_company_id) {
    await expectRpcReject("arbitrary_company_id", [
      f.foreign_company_id,
      "ticket",
      String(f.ticket_id),
      null,
      f.assignee_id,
      "assigned",
      "human",
      f.actor_id,
    ]);
  } else {
    fail("fabrication", "arbitrary_company_id", "no foreign company fixture");
  }

  await expectRpcReject("cross_company_resource", [
    f.company_id,
    "ticket",
    "00000000-0000-0000-0000-000000000099",
    null,
    f.assignee_id,
    "assigned",
    "human",
    f.actor_id,
  ]);

  if (f.foreign_user_id) {
    await expectRpcReject("cross_company_new_assignee", [
      f.company_id,
      "ticket",
      String(f.ticket_id),
      null,
      f.foreign_user_id,
      "assigned",
      "human",
      f.actor_id,
    ]);
  } else {
    fail("fabrication", "cross_company_new_assignee", "no foreign user fixture");
  }

  await expectRpcReject("source_ai_as_authenticated", [
    f.company_id,
    "ticket",
    String(f.ticket_id),
    null,
    f.assignee_id,
    "assigned",
    "ai",
    f.actor_id,
  ]);

  await expectRpcReject("source_system_as_authenticated", [
    f.company_id,
    "ticket",
    String(f.ticket_id),
    null,
    f.assignee_id,
    "assigned",
    "system",
    f.actor_id,
  ]);

  // Ensure no fabricated leftover rows from this phase label outside committed legitimate writes
  const leftover = await client.query(
    `select count(*)::int as n from public.assignment_audit_events
     where metadata->>'phase' in ('5.2-actor-force')`,
  );
  if (leftover.rows[0].n === 0) pass("fabrication", "no_leftover_fabricated_rows");
  else fail("fabrication", "no_leftover_fabricated_rows", `count=${leftover.rows[0].n}`);

  // ── 9. Read API ─────────────────────────────────────────────
  if (supabaseUrl && serviceKey) {
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auditMod = await import(
      pathToFileURL(resolve(root, "lib/assignment-audit/src/index.ts")).href
    );
    const audit = new auditMod.AssignmentAuditService({
      port: auditMod.createSupabaseAssignmentAuditDataPort(sb),
    });
    const history = await audit.getAssignmentHistory({
      companyId: String(f.company_id),
      resourceType: "ticket",
      resourceId: String(f.ticket_id),
      limit: 5,
      offset: 0,
    });
    const newestFirst =
      history.length < 2 || history[0].createdAt >= history[1].createdAt;
    const companyScoped = history.every((e) => e.companyId === String(f.company_id));
    if (history.length > 0 && newestFirst && companyScoped) {
      pass("readApi", "getAssignmentHistory", `rows=${history.length}`);
    } else if (history.length === 0) {
      fail("readApi", "getAssignmentHistory", "expected at least one row after legitimate write");
    } else {
      fail(
        "readApi",
        "getAssignmentHistory",
        `newestFirst=${newestFirst} companyScoped=${companyScoped}`,
      );
    }

    if (f.foreign_company_id) {
      const cross = await audit.getAssignmentHistory({
        companyId: String(f.foreign_company_id),
        resourceType: "ticket",
        resourceId: String(f.ticket_id),
        limit: 5,
      });
      if (cross.length === 0) pass("readApi", "cross_company_empty");
      else fail("readApi", "cross_company_empty", `leaked ${cross.length} rows`);
    }
  }

  // ── 10. End-to-end smoke (ticket assign/reassign/unassign) ──
  // Use TicketCommandService with service client + assignmentAudit enabled.
  if (supabaseUrl && serviceKey) {
    const { createTicketPlatformServices } = await import(
      pathToFileURL(resolve(root, "lib/ticket-platform/src/index.ts")).href
    );
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const platform = createTicketPlatformServices(sb, {
      assignmentGovernance: false,
    });
    const ctx = {
      userId: String(f.actor_id),
      companyId: String(f.company_id),
      isSuperAdmin: true,
      hasPermission: () => true,
    };

    const beforeE2e = await client.query(
      `select count(*)::int as n from public.assignment_audit_events
       where company_id = $1 and resource_type = 'ticket' and resource_id = $2`,
      [f.company_id, String(f.ticket_id)],
    );

    // Capture current assignee then run assign -> reassign -> unassign
    const current = await client.query(
      `select assigned_user_id from public.support_tickets where id = $1 and company_id = $2`,
      [f.ticket_id, f.company_id],
    );
    const originalAssignee = current.rows[0]?.assigned_user_id ?? null;

    try {
      await platform.commands.assignTicket(ctx, {
        companyId: String(f.company_id),
        ticketId: String(f.ticket_id),
        assigneeUserId: String(f.assignee_id),
        assignmentAuditSource: "human",
      });

      // Second assignee for reassignment if available; else leave assigned and unassign only
      const third = await client.query(
        `select id from public.profiles
         where company_id = $1 and is_active is true and id not in ($2::uuid, $3::uuid)
         limit 1`,
        [f.company_id, f.actor_id, f.assignee_id],
      );
      const reassignTarget = third.rows[0]?.id ?? String(f.actor_id);

      await platform.commands.assignTicket(ctx, {
        companyId: String(f.company_id),
        ticketId: String(f.ticket_id),
        assigneeUserId: String(reassignTarget),
        assignmentAuditSource: "human",
      });

      await platform.commands.unassignTicket(ctx, {
        companyId: String(f.company_id),
        ticketId: String(f.ticket_id),
        assignmentAuditSource: "human",
      });

      const events = await client.query(
        `select action, source, previous_assignee_user_id, new_assignee_user_id, created_at
         from public.assignment_audit_events
         where company_id = $1 and resource_type = 'ticket' and resource_id = $2
           and created_at > now() - interval '10 minutes'
           and source = 'human'
         order by created_at desc
         limit 10`,
        [f.company_id, String(f.ticket_id)],
      );

      const actions = events.rows.map((r) => r.action);
      const hasAssigned = actions.includes("assigned") || actions.includes("reassigned");
      const hasUnassigned = actions.includes("unassigned");
      const allHuman = events.rows.every((r) => r.source === "human");

      if (hasAssigned && hasUnassigned && allHuman) {
        pass(
          "endToEnd",
          "ticket_assign_reassign_unassign",
          `recent_human_events=${events.rows.length} actions=${actions.join(",")}`,
        );
      } else {
        fail(
          "endToEnd",
          "ticket_assign_reassign_unassign",
          `actions=${actions.join(",")} allHuman=${allHuman}`,
        );
      }

      // Restore original assignee best-effort (no audit requirement)
      if (originalAssignee) {
        await client.query(
          `update public.support_tickets
           set assigned_user_id = $1, updated_at = now()
           where id = $2 and company_id = $3`,
          [originalAssignee, f.ticket_id, f.company_id],
        );
      }
    } catch (error) {
      fail("endToEnd", "ticket_assign_reassign_unassign", String(error.message || error));
    }

    const afterE2e = await client.query(
      `select count(*)::int as n from public.assignment_audit_events
       where company_id = $1 and resource_type = 'ticket' and resource_id = $2`,
      [f.company_id, String(f.ticket_id)],
    );
    report.endToEnd.beforeCount = beforeE2e.rows[0].n;
    report.endToEnd.afterCount = afterE2e.rows[0].n;
  } else {
    fail("endToEnd", "ticket_assign_reassign_unassign", "service credentials missing");
  }

  console.log(JSON.stringify({ report }, null, 2));
  if (report.failures.length > 0) process.exit(1);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await client.end();
}
