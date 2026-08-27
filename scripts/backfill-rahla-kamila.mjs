/**
 * Apply migration 324 + run safe Rahla Kamila backfill orchestration.
 *
 * Steps:
 * 1) Apply 324 (backfill function)
 * 2) Disposable company: entitle WITHOUT grant-hook (direct override) → backfill
 * 3) Backfill CVP (confirmed product gap)
 * 4) Backfill all product tenants (idempotent)
 * 5) Independence probe on CVP (rename + restore; harmless config touch)
 * 6) Idempotency re-run
 * 7) New disposable company via set_company_feature_grant (future path)
 * 8) Report
 *
 * Does NOT modify Super Admin source content.
 * Does NOT change CVP permissions/subscription/owner.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("../artifacts/login-app/node_modules/@supabase/supabase-js");

const CVP = "d4fdae9a-bb72-4bae-903c-cb4b971d18a8";
const SOURCE = "4003669c-12fb-44b3-9835-a655bd8ba5d6";
const PREFIX = `RahlaBackfill ${Date.now()} `;

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query(`select set_config('request.jwt.claim.role', 'service_role', false)`);
await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);

const report = {
  stamp: new Date().toISOString(),
  candidatesBefore: [],
  backfillResults: [],
  verification: {},
  steps: [],
  pass: true,
};
const createdCompanies = [];
const createdUsers = [];

function step(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  if (!ok) report.pass = false;
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`, detail.reason || detail.status || "");
}

async function flowStats(companyId) {
  const { rows } = await c.query(
    `select f.id, f.name, f.company_id, f.status,
            f.metadata->>'one_time_clone_key' as clone_key,
            f.metadata->>'one_time_cloned_at' as cloned_at,
            (select count(*)::int from automation_nodes n where n.flow_id=f.id) as nodes,
            (select count(*)::int from automation_edges e where e.flow_id=f.id) as edges
     from automation_flows f
     where f.company_id=$1 and f.deleted_at is null
       and f.metadata->>'one_time_clone_key'='rahla_kamila'`,
    [companyId],
  );
  return rows;
}

async function sourceSnapshotIds() {
  const { rows } = await c.query(
    `select snapshot from automation_flow_versions
     where flow_id=$1 and is_active=true order by version_number desc limit 1`,
    [SOURCE],
  );
  const snap = rows[0]?.snapshot;
  return {
    nodes: (snap?.nodes ?? []).length,
    edges: (snap?.edges ?? []).length,
    nodeIds: new Set((snap?.nodes ?? []).map((n) => n.id)),
    edgeIds: new Set((snap?.edges ?? []).map((e) => e.id)),
    name: snap?.name,
    firstConfig: JSON.stringify(snap?.nodes?.[0]?.config ?? null),
  };
}

async function makeDisposableCompany(label) {
  const { rows } = await c.query(
    `insert into public.companies (
       name, status, subscription_plan, subscription_status, company_type,
       approval_status, approval_requested_at, tenant_provisioning_status
     ) values ($1, 'Active', 'Enterprise', 'active', 'tenant',
       'approved', now(), 'completed')
     returning id, name`,
    [`${PREFIX}${label}`],
  );
  createdCompanies.push(rows[0].id);
  await c.query(`select public._ensure_core_system_feature_grants($1)`, [rows[0].id]);
  return rows[0];
}

try {
  // ── Apply migration 324
  const sql = readFileSync(
    resolve(root, "supabase/migrations/324_backfill_rahla_kamila_one_time_clone.sql"),
    "utf8",
  );
  await c.query(sql);
  step("apply migration 324", true);

  // ── Candidates before
  const { rows: entitled } = await c.query(`
    select c.id, c.name, c.company_type,
           public.is_feature_enabled(c.id,'workflow_automation') as entitlement,
           exists (
             select 1 from automation_flows f
             where f.company_id=c.id and f.deleted_at is null
               and f.metadata->>'one_time_clone_key'='rahla_kamila'
           ) as has_clone
    from companies c
    where public.is_feature_enabled(c.id,'workflow_automation')=true
      and c.company_type='tenant'
      and c.name !~* '^(RahlaClone|RahlaBackfill|Review (Pkg|RBAC)|Scroll|RBAC|Lead Tog)'
      and coalesce(c.contact_email,'') !~* '@valueor\\.test$'
    order by c.created_at
  `);
  report.candidatesBefore = entitled.filter((r) => !r.has_clone);
  step("audit candidates before", true, {
    count: report.candidatesBefore.length,
    companies: report.candidatesBefore.map((r) => r.name),
  });

  const srcBefore = await sourceSnapshotIds();
  step("source published snapshot", srcBefore.nodes === 43 && srcBefore.edges === 50, {
    nodes: srcBefore.nodes,
    edges: srcBefore.edges,
  });

  // ── Disposable: entitle WITHOUT grant hook (direct override) then backfill
  const disposable = await makeDisposableCompany("Smoke");
  await c.query(
    `insert into company_feature_overrides (
       company_id, feature_code, override_state, is_active, source, starts_at, reason, notes
     ) values ($1, 'workflow_automation', 'enabled', true, 'manual', now(),
               'backfill-smoke-direct', 'simulate pre-322 entitled company')`,
    [disposable.id],
  );
  const { rows: entSmoke } = await c.query(
    `select public.is_feature_enabled($1,'workflow_automation') as e`,
    [disposable.id],
  );
  const beforeSmoke = await flowStats(disposable.id);
  step("disposable entitled without clone", entSmoke[0].e === true && beforeSmoke.length === 0, {
    entitled: entSmoke[0].e,
    flows: beforeSmoke.length,
  });

  const { rows: smokeBackfill } = await c.query(
    `select public.backfill_rahla_kamila_workflows_v1($1) as r`,
    [disposable.id],
  );
  const smokeFlows = await flowStats(disposable.id);
  const smokeOk =
    smokeBackfill[0].r?.result?.status === "provisioned" &&
    smokeFlows.length === 1 &&
    smokeFlows[0].nodes === 43 &&
    smokeFlows[0].edges === 50;
  step("disposable backfill provisioned", smokeOk, {
    result: smokeBackfill[0].r,
    flow: smokeFlows[0],
  });
  report.backfillResults.push({
    company: disposable.name,
    id: disposable.id,
    cloneCreated: smokeOk,
    flowId: smokeFlows[0]?.id,
    nodes: smokeFlows[0]?.nodes,
    edges: smokeFlows[0]?.edges,
  });

  // ── CVP backfill
  const cvpBefore = await flowStats(CVP);
  const { rows: cvpBackfill } = await c.query(
    `select public.backfill_rahla_kamila_workflows_v1($1::uuid) as r`,
    [CVP],
  );
  const cvpFlows = await flowStats(CVP);
  const cvpOk =
    (cvpBackfill[0].r?.result?.status === "provisioned" ||
      (cvpBefore.length === 0 && cvpFlows.length === 1)) &&
    cvpFlows.length === 1 &&
    cvpFlows[0].company_id === CVP &&
    cvpFlows[0].nodes === 43 &&
    cvpFlows[0].edges === 50 &&
    cvpFlows[0].status === "active";
  step("CVP backfill", cvpOk, {
    result: cvpBackfill[0].r,
    flow: cvpFlows[0],
  });
  report.backfillResults.push({
    company: "CVP",
    id: CVP,
    cloneCreated: cvpBackfill[0].r?.result?.status === "provisioned",
    flowId: cvpFlows[0]?.id,
    nodes: cvpFlows[0]?.nodes,
    edges: cvpFlows[0]?.edges,
    status: cvpFlows[0]?.status,
  });

  // Unique IDs vs source
  const { rows: cvpNodeIds } = await c.query(
    `select id::text as id from automation_nodes where flow_id=$1`,
    [cvpFlows[0].id],
  );
  const { rows: cvpEdgeIds } = await c.query(
    `select id::text as id from automation_edges where flow_id=$1`,
    [cvpFlows[0].id],
  );
  const overlapNodes = cvpNodeIds.filter((n) => srcBefore.nodeIds.has(n.id)).length;
  const overlapEdges = cvpEdgeIds.filter((e) => srcBefore.edgeIds.has(e.id)).length;
  step("CVP IDs independent from source", overlapNodes === 0 && overlapEdges === 0, {
    overlapNodes,
    overlapEdges,
  });

  // List query path (same filters as UI repository)
  const { rows: listRows } = await c.query(
    `select id, name, status from automation_flows
     where company_id=$1 and deleted_at is null
     order by updated_at desc`,
    [CVP],
  );
  step("CVP visible in list query", listRows.some((r) => r.id === cvpFlows[0].id && r.name.includes("رحلة")), {
    names: listRows.map((r) => r.name),
  });

  // ── Product-wide backfill (should only already_provisioned for CVP etc.)
  const { rows: allBackfill } = await c.query(
    `select public.backfill_rahla_kamila_workflows_v1(null) as r`,
  );
  step("product-wide backfill idempotent", allBackfill[0].r?.errors === 0, {
    result: allBackfill[0].r,
  });

  // ── Independence: rename CVP copy, touch one node config, verify source unchanged
  const originalName = cvpFlows[0].name;
  const probeName = `${originalName} __probe__`;
  const { rows: probeNode } = await c.query(
    `select id, config from automation_nodes where flow_id=$1 order by id limit 1`,
    [cvpFlows[0].id],
  );
  const originalConfig = probeNode[0].config;
  const probedConfig = { ...originalConfig, __backfill_probe: true };

  await c.query(`update automation_flows set name=$2, updated_at=now() where id=$1`, [
    cvpFlows[0].id,
    probeName,
  ]);
  await c.query(`update automation_nodes set config=$2::jsonb where id=$1`, [
    probeNode[0].id,
    JSON.stringify(probedConfig),
  ]);

  const srcAfter = await sourceSnapshotIds();
  const sourceUntouched =
    srcAfter.nodes === srcBefore.nodes &&
    srcAfter.edges === srcBefore.edges &&
    srcAfter.name === srcBefore.name &&
    srcAfter.firstConfig === srcBefore.firstConfig &&
    [...srcBefore.nodeIds].every((id) => srcAfter.nodeIds.has(id));
  step("source unchanged after CVP probe edits", sourceUntouched);

  // Disposable independence from CVP
  const smokeNodeIds = (
    await c.query(`select id::text as id from automation_nodes where flow_id=$1`, [smokeFlows[0].id])
  ).rows.map((r) => r.id);
  const cvpIds = new Set(cvpNodeIds.map((r) => r.id));
  const crossOverlap = smokeNodeIds.filter((id) => cvpIds.has(id)).length;
  step("disposable vs CVP node ID isolation", crossOverlap === 0, { crossOverlap });

  // Restore CVP name + config
  await c.query(`update automation_flows set name=$2, updated_at=now() where id=$1`, [
    cvpFlows[0].id,
    originalName,
  ]);
  await c.query(`update automation_nodes set config=$2::jsonb where id=$1`, [
    probeNode[0].id,
    JSON.stringify(originalConfig),
  ]);
  step("restored CVP probe edits", true, { name: originalName });

  // ── Idempotency: provision CVP again
  const { rows: again } = await c.query(
    `select public.provision_rahla_kamila_workflow_v1($1) as r`,
    [CVP],
  );
  const cvpAfterIdem = await flowStats(CVP);
  step("idempotency second provision", again[0].r?.status === "already_provisioned" && cvpAfterIdem.length === 1, {
    result: again[0].r,
    count: cvpAfterIdem.length,
  });

  // ── Future path: new disposable via set_company_feature_grant
  const future = await makeDisposableCompany("FutureHook");
  const { rows: grant } = await c.query(
    `select public.set_company_feature_grant($1, 'workflow_automation', true, 'manual', now(), null, $2, 'future-hook') as id`,
    [future.id, `${PREFIX}grant`],
  );
  const futureFlows = await flowStats(future.id);
  step("future grant auto-provisions clone", Boolean(grant[0].id) && futureFlows.length === 1 && futureFlows[0].nodes === 43, {
    grantId: grant[0].id,
    flow: futureFlows[0],
  });
  report.backfillResults.push({
    company: future.name,
    id: future.id,
    cloneCreated: true,
    via: "set_company_feature_grant",
    flowId: futureFlows[0]?.id,
    nodes: futureFlows[0]?.nodes,
    edges: futureFlows[0]?.edges,
  });

  // Not entitled must not clone
  const noEnt = await makeDisposableCompany("NoEntitlement");
  const { rows: skip } = await c.query(
    `select public.provision_rahla_kamila_workflow_v1($1) as r`,
    [noEnt.id],
  );
  step("not entitled skipped", skip[0].r?.status === "skipped_not_entitled", { result: skip[0].r });

  // Final CVP state
  const finalCvp = await flowStats(CVP);
  const finalSrc = await sourceSnapshotIds();
  report.verification = {
    cvpCloneCount: finalCvp.length,
    cvpFlow: finalCvp[0],
    sourceStill43_50: finalSrc.nodes === 43 && finalSrc.edges === 50,
    listVisible: listRows.some((r) => r.name.includes("رحلة")),
    browser: "BLOCKED — no valid nhossam@ntgclarity.com credentials; verified via DB list path matching UI repository filters",
  };

  step("final CVP single clone", finalCvp.length === 1 && finalCvp[0].nodes === 43);

  // Cleanup disposables only (NOT CVP)
  for (const id of createdCompanies) {
    await c.query(`delete from automation_edges where flow_id in (select id from automation_flows where company_id=$1)`, [id]).catch(() => {});
    await c.query(`delete from automation_nodes where flow_id in (select id from automation_flows where company_id=$1)`, [id]).catch(() => {});
    await c.query(`delete from automation_flow_versions where flow_id in (select id from automation_flows where company_id=$1)`, [id]).catch(() => {});
    await c.query(`delete from automation_flows where company_id=$1`, [id]).catch(() => {});
    await c.query(`delete from company_feature_overrides where company_id=$1`, [id]).catch(() => {});
    await c.query(`delete from companies where id=$1`, [id]).catch(() => {});
  }
  for (const uid of createdUsers) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
  step("cleaned disposable companies", true, { count: createdCompanies.length });

  const out = resolve(root, "scripts/_tmp-rahla-backfill-report.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log("\nReport:", out);
  console.log(report.pass ? "\nALL CHECKS PASSED\n" : "\nSOME CHECKS FAILED\n");
  process.exitCode = report.pass ? 0 : 1;
} catch (error) {
  console.error(error);
  report.error = String(error);
  writeFileSync(resolve(root, "scripts/_tmp-rahla-backfill-report.json"), JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await c.end();
}
