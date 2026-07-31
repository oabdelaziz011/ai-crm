/**
 * Sprint 6.2.5 — Live AI Agent RLS E2E validation against linked Supabase.
 * Run: npx tsx scripts/agents-rls-e2e-validation.mts
 *
 * Uses real authenticated Supabase sessions (no mocked authorization).
 * Setup/teardown uses Super Admin session; restores feature flags and temp grants.
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupabaseEnv, resolveProjectRoot, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolveProjectRoot(import.meta.url);

const DEMO_PASSWORD = "DemoVault2026!";
const COMPANY_ALPHA = "d0000010-0001-4001-8001-000000000001";
const COMPANY_BETA = "d0000010-0001-4001-8001-000000000002";

const ACTORS = {
  superAdmin: { email: "demo-platform@vaultos.local", label: "Super Admin" },
  companyAdmin: { email: "demo-beta-admin@vaultos.local", label: "Company Admin" },
  runtimeExecute: { email: "demo-support@vaultos.local", label: "Runtime Execute" },
  viewOnly: { email: "demo-finance@vaultos.local", label: "View Only" },
  noPermission: { email: "demo-employee@vaultos.local", label: "No Permission" },
  tenantOther: { email: "demo-alpha-admin@vaultos.local", label: "Alpha Admin (tenant mismatch)" },
} as const;

const POLICIES = {
  select: "company_has_agents_access(company_id, 'agents.view')",
  insertExecute: "company_has_agents_access(company_id, 'agents.execute')",
  updateExecute: "company_has_agents_access(company_id, 'agents.execute')",
  deleteManage: "company_has_agents_access(company_id, 'agents.manage')",
} as const;

type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
type Access = "ALLOW" | "DENY";

type ValidationRow = {
  scenario: string;
  actor: string;
  table: string;
  operation: Operation;
  policy: string;
  featureState: "ON" | "OFF" | "n/a";
  expected: Access;
  actual: Access;
  pass: boolean;
  detail: string;
};

const results: ValidationRow[] = [];

function record(row: Omit<ValidationRow, "pass">) {
  const pass = row.expected === row.actual;
  const entry = { ...row, pass };
  results.push(entry);
  console.log(
    `[${pass ? "PASS" : "FAIL"}] ${row.actor} | ${row.table} ${row.operation} | ${row.scenario} — expected=${row.expected} actual=${row.actual}${row.detail ? ` (${row.detail})` : ""}`,
  );
}

async function signIn(url: string, key: string, email: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { client, userId: data.user!.id };
}

async function hasPermission(client: SupabaseClient, code: string): Promise<boolean> {
  const { data, error } = await client.rpc("user_has_permission", { p_code: code });
  if (error) throw new Error(`user_has_permission(${code}): ${error.message}`);
  return data === true;
}

async function featureEnabled(client: SupabaseClient, companyId: string): Promise<boolean> {
  const { data, error } = await client.rpc("platform_ai_feature_enabled", {
    p_company_id: companyId,
    p_feature_key: "ai_agents",
  });
  if (error) throw new Error(`platform_ai_feature_enabled: ${error.message}`);
  return data === true;
}

async function readFeatureFlagRow(client: SupabaseClient, companyId: string) {
  const { data, error } = await client
    .from("platform_ai_feature_flags")
    .select("is_enabled")
    .eq("company_id", companyId)
    .eq("feature_key", "ai_agents")
    .maybeSingle();
  if (error) throw new Error(`read ai_agents flag: ${error.message}`);
  return data?.is_enabled as boolean | undefined;
}

async function setAgentsFeature(
  platform: SupabaseClient,
  platformUserId: string,
  companyId: string,
  enabled: boolean,
): Promise<{ ok: boolean; detail: string }> {
  const { error } = await platform.from("platform_ai_feature_flags").upsert(
    {
      company_id: companyId,
      feature_key: "ai_agents",
      is_enabled: enabled,
      updated_by: platformUserId,
    },
    { onConflict: "company_id,feature_key" },
  );
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: "ok" };
}

async function permissionIds(platform: SupabaseClient, codes: string[]): Promise<Map<string, string>> {
  const { data, error } = await platform.from("permissions").select("id, code").in("code", codes);
  if (error) throw new Error(`permissions lookup: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.code as string, row.id as string);
  return map;
}

async function grantUserPermissions(
  platform: SupabaseClient,
  userId: string,
  permMap: Map<string, string>,
  codes: string[],
) {
  for (const code of codes) {
    const permissionId = permMap.get(code);
    if (!permissionId) throw new Error(`permission not found: ${code}`);
    const { error } = await platform.from("user_permissions").upsert(
      { user_id: userId, permission_id: permissionId },
      { onConflict: "user_id,permission_id" },
    );
    if (error) throw new Error(`grant ${code}: ${error.message}`);
  }
}

async function revokeUserPermissions(platform: SupabaseClient, userId: string, permMap: Map<string, string>, codes: string[]) {
  const ids = codes.map((code) => permMap.get(code)).filter(Boolean) as string[];
  if (ids.length === 0) return;
  const { error } = await platform.from("user_permissions").delete().eq("user_id", userId).in("permission_id", ids);
  if (error) throw new Error(`revoke permissions: ${error.message}`);
}

type Fixture = {
  workflowId: string;
  eventId?: string;
  checkpointId?: string;
};

async function createFixture(platform: SupabaseClient, companyId: string, userId: string): Promise<Fixture> {
  const correlationId = `agents-rls-e2e-${Date.now()}`;
  const { data: workflow, error: workflowError } = await platform
    .from("agent_workflows")
    .insert({
      company_id: companyId,
      user_id: userId,
      goal: "Sprint 6.2.5 agents RLS E2E fixture",
      status: "planning",
      task_graph: {},
      memory: {},
      correlation_id: correlationId,
    })
    .select("id")
    .single();
  if (workflowError) throw new Error(`fixture workflow: ${workflowError.message}`);

  const workflowId = workflow.id as string;

  const { data: event, error: eventError } = await platform
    .from("agent_workflow_events")
    .insert({
      workflow_id: workflowId,
      company_id: companyId,
      event_type: "PlanningStarted",
      payload: { source: "agents-rls-e2e" },
    })
    .select("id")
    .single();
  if (eventError) throw new Error(`fixture event: ${eventError.message}`);

  const { data: checkpoint, error: checkpointError } = await platform
    .from("agent_workflow_checkpoints")
    .insert({
      workflow_id: workflowId,
      company_id: companyId,
      checkpoint_index: 0,
      snapshot: { source: "agents-rls-e2e" },
    })
    .select("id")
    .single();
  if (checkpointError) throw new Error(`fixture checkpoint: ${checkpointError.message}`);

  return { workflowId, eventId: event.id as string, checkpointId: checkpoint.id as string };
}

async function deleteFixture(platform: SupabaseClient, workflowId: string) {
  await platform.from("agent_workflows").delete().eq("id", workflowId);
}

function classifySelect(rows: unknown[] | null | undefined, error: { message: string } | null, expectAllow: boolean): Access {
  if (error) return "DENY";
  const count = rows?.length ?? 0;
  return expectAllow ? (count > 0 ? "ALLOW" : "DENY") : count === 0 ? "DENY" : "ALLOW";
}

function classifyWrite(error: { message: string; code?: string } | null, expectAllow: boolean): Access {
  if (expectAllow) return error ? "DENY" : "ALLOW";
  return error ? "DENY" : "ALLOW";
}

async function testSelect(
  client: SupabaseClient,
  table: "agent_workflows" | "agent_workflow_events" | "agent_workflow_checkpoints",
  filter: Record<string, string>,
  meta: Omit<ValidationRow, "actual" | "pass" | "detail" | "operation" | "table" | "policy"> & { expected: Access },
) {
  let query = client.from(table).select("id");
  for (const [column, value] of Object.entries(filter)) query = query.eq(column, value);
  const { data, error } = await query;
  const actual = classifySelect(data, error, meta.expected === "ALLOW");
  record({
    ...meta,
    table,
    operation: "SELECT",
    policy: POLICIES.select,
    actual,
    detail: error?.message ?? `rows=${data?.length ?? 0}`,
  });
}

async function testWorkflowInsert(
  client: SupabaseClient,
  companyId: string,
  userId: string,
  meta: Omit<ValidationRow, "actual" | "pass" | "detail" | "operation" | "table" | "policy"> & { expected: Access },
) {
  const { error } = await client.from("agent_workflows").insert({
    company_id: companyId,
    user_id: userId,
    goal: "RLS probe insert",
    status: "planning",
    task_graph: {},
    memory: {},
    correlation_id: `probe-${Date.now()}`,
  });
  const actual = classifyWrite(error, meta.expected === "ALLOW");
  record({
    ...meta,
    table: "agent_workflows",
    operation: "INSERT",
    policy: POLICIES.insertExecute,
    actual,
    detail: error?.message ?? "ok",
  });
}

async function testWorkflowUpdate(
  client: SupabaseClient,
  workflowId: string,
  meta: Omit<ValidationRow, "actual" | "pass" | "detail" | "operation" | "table" | "policy"> & { expected: Access },
) {
  const { error } = await client
    .from("agent_workflows")
    .update({ status: "running" })
    .eq("id", workflowId);
  const actual = classifyWrite(error, meta.expected === "ALLOW");
  record({
    ...meta,
    table: "agent_workflows",
    operation: "UPDATE",
    policy: POLICIES.updateExecute,
    actual,
    detail: error?.message ?? "ok",
  });
}

async function testWorkflowDelete(
  client: SupabaseClient,
  workflowId: string,
  meta: Omit<ValidationRow, "actual" | "pass" | "detail" | "operation" | "table" | "policy"> & { expected: Access },
) {
  const { error } = await client.from("agent_workflows").delete().eq("id", workflowId);
  const actual = classifyWrite(error, meta.expected === "ALLOW");
  record({
    ...meta,
    table: "agent_workflows",
    operation: "DELETE",
    policy: POLICIES.deleteManage,
    actual,
    detail: error?.message ?? "ok",
  });
}

async function testChildInsert(
  client: SupabaseClient,
  table: "agent_workflow_events" | "agent_workflow_checkpoints",
  payload: Record<string, unknown>,
  meta: Omit<ValidationRow, "actual" | "pass" | "detail" | "operation" | "table" | "policy"> & { expected: Access },
) {
  const { error } = await client.from(table).insert(payload);
  const actual = classifyWrite(error, meta.expected === "ALLOW");
  record({
    ...meta,
    table,
    operation: "INSERT",
    policy: POLICIES.insertExecute,
    actual,
    detail: error?.message ?? "ok",
  });
}

async function verifyActorPermissions(
  clients: Record<keyof typeof ACTORS, { client: SupabaseClient; userId: string }>,
  permMap: Map<string, string>,
  tempGrants: { viewOnlyUserId: string; runtimeExecuteUserId: string },
) {
  const checks: Array<{ actor: string; code: string; expected: boolean }> = [
    { actor: ACTORS.companyAdmin.label, code: "agents.view", expected: true },
    { actor: ACTORS.companyAdmin.label, code: "agents.execute", expected: true },
    { actor: ACTORS.companyAdmin.label, code: "agents.manage", expected: true },
    { actor: ACTORS.runtimeExecute.label, code: "agents.view", expected: true },
    { actor: ACTORS.runtimeExecute.label, code: "agents.execute", expected: true },
    { actor: ACTORS.runtimeExecute.label, code: "agents.manage", expected: false },
    { actor: ACTORS.viewOnly.label, code: "agents.view", expected: true },
    { actor: ACTORS.viewOnly.label, code: "agents.execute", expected: false },
    { actor: ACTORS.viewOnly.label, code: "agents.manage", expected: false },
    { actor: ACTORS.noPermission.label, code: "agents.view", expected: false },
    { actor: ACTORS.noPermission.label, code: "agents.execute", expected: false },
  ];

  const actorClients: Record<string, SupabaseClient> = {
    [ACTORS.companyAdmin.label]: clients.companyAdmin.client,
    [ACTORS.runtimeExecute.label]: clients.runtimeExecute.client,
    [ACTORS.viewOnly.label]: clients.viewOnly.client,
    [ACTORS.noPermission.label]: clients.noPermission.client,
  };

  for (const check of checks) {
    const client = actorClients[check.actor];
    const actual = await hasPermission(client, check.code);
    record({
      scenario: "Actor permission precondition",
      actor: check.actor,
      table: "permissions",
      operation: "SELECT",
      policy: "user_has_permission()",
      featureState: "n/a",
      expected: check.expected ? "ALLOW" : "DENY",
      actual: actual ? "ALLOW" : "DENY",
      detail: check.code,
    });
  }

  void permMap;
  void tempGrants;
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) {
    console.error("Missing Supabase URL or publishable key");
    process.exit(2);
  }

  console.log("=== Sprint 6.2.5 — AI Agent RLS Live E2E Validation ===\n");

  const platform = await signIn(config.url, config.key, ACTORS.superAdmin.email);
  const companyAdmin = await signIn(config.url, config.key, ACTORS.companyAdmin.email);
  const runtimeExecute = await signIn(config.url, config.key, ACTORS.runtimeExecute.email);
  const viewOnly = await signIn(config.url, config.key, ACTORS.viewOnly.email);
  const noPermission = await signIn(config.url, config.key, ACTORS.noPermission.email);
  const tenantOther = await signIn(config.url, config.key, ACTORS.tenantOther.email);

  const clients = { superAdmin: platform, companyAdmin, runtimeExecute, viewOnly, noPermission, tenantOther };

  const permMap = await permissionIds(platform.client, [
    "agents.view",
    "agents.execute",
    "agents.manage",
  ]);

  const agentsMigrationsApplied =
    permMap.has("agents.view") && permMap.has("agents.execute") && permMap.has("agents.manage");

  if (!agentsMigrationsApplied) {
    record({
      scenario: "Precondition — agents RBAC permissions seeded",
      actor: ACTORS.superAdmin.label,
      table: "permissions",
      operation: "SELECT",
      policy: "agents.view / agents.execute / agents.manage",
      featureState: "n/a",
      expected: "ALLOW",
      actual: "DENY",
      detail: `found=${[...permMap.keys()].join(", ") || "none"} — migration 196 may not be applied`,
    });
  }

  const originalFeatureEnabled = await readFeatureFlagRow(platform.client, COMPANY_BETA);
  let fixture: Fixture | null = null;
  let deleteProbeWorkflowId: string | null = null;
  let featureFlagWritable = true;

  try {
    const enableResult = await setAgentsFeature(platform.client, platform.userId, COMPANY_BETA, true);
    if (!enableResult.ok) {
      featureFlagWritable = false;
      record({
        scenario: "Precondition — ai_agents feature flag writable",
        actor: ACTORS.superAdmin.label,
        table: "platform_ai_feature_flags",
        operation: "INSERT",
        policy: "platform_ai_feature_flags_write (super-admin)",
        featureState: "n/a",
        expected: "ALLOW",
        actual: "DENY",
        detail: enableResult.detail,
      });
    }

    const featureOn = await featureEnabled(companyAdmin.client, COMPANY_BETA);
    record({
      scenario: "Precondition — ai_agents effective for beta",
      actor: ACTORS.companyAdmin.label,
      table: "platform_ai_feature_flags",
      operation: "SELECT",
      policy: "platform_ai_feature_enabled(..., 'ai_agents')",
      featureState: featureOn ? "ON" : "OFF",
      expected: "ALLOW",
      actual: featureOn ? "ALLOW" : "DENY",
      detail: featureFlagWritable ? `row=${originalFeatureEnabled ?? "missing→coalesce true"}` : "feature flag row not writable",
    });

    if (agentsMigrationsApplied) {
      await grantUserPermissions(platform.client, runtimeExecute.userId, permMap, [
        "agents.view",
        "agents.execute",
      ]);
      await grantUserPermissions(platform.client, viewOnly.userId, permMap, ["agents.view"]);

      await verifyActorPermissions(clients, permMap, {
        viewOnlyUserId: viewOnly.userId,
        runtimeExecuteUserId: runtimeExecute.userId,
      });
    }

    let fixtureError: string | null = null;
    try {
      fixture = await createFixture(platform.client, COMPANY_BETA, companyAdmin.userId);
    } catch (error) {
      fixtureError = error instanceof Error ? error.message : String(error);
      record({
        scenario: "Fixture — create agent workflow via super admin",
        actor: ACTORS.superAdmin.label,
        table: "agent_workflows",
        operation: "INSERT",
        policy: "super-admin bypass",
        featureState: "n/a",
        expected: "ALLOW",
        actual: "DENY",
        detail: fixtureError,
      });
    }

    if (!agentsMigrationsApplied || !fixture) {
      if (!agentsMigrationsApplied) {
        record({
          scenario: "RLS matrix execution",
          actor: "all",
          table: "agent_workflows",
          operation: "SELECT",
          policy: "company_has_agents_access(...)",
          featureState: "n/a",
          expected: "ALLOW",
          actual: "DENY",
          detail: "skipped — migration 196 (agents RBAC) not applied on target DB",
        });
      }
    } else {
    for (const [actorKey, expected] of [
      ["superAdmin", "ALLOW"],
      ["companyAdmin", "ALLOW"],
      ["runtimeExecute", "ALLOW"],
      ["viewOnly", "ALLOW"],
      ["noPermission", "DENY"],
    ] as const) {
      const actor = ACTORS[actorKey === "superAdmin" ? "superAdmin" : actorKey];
      const client = clients[actorKey].client;
      await testSelect(client, "agent_workflows", { id: fixture.workflowId }, {
        scenario: "Feature ON — read own-tenant workflow",
        actor: actor.label,
        featureState: "ON",
        expected,
      });
      await testSelect(client, "agent_workflow_events", { id: fixture.eventId! }, {
        scenario: "Feature ON — read workflow event",
        actor: actor.label,
        featureState: "ON",
        expected,
      });
      await testSelect(client, "agent_workflow_checkpoints", { id: fixture.checkpointId! }, {
        scenario: "Feature ON — read workflow checkpoint",
        actor: actor.label,
        featureState: "ON",
        expected,
      });
    }

    // ── Feature ON — write paths (workflows) ───────────────────
    await testWorkflowInsert(companyAdmin.client, COMPANY_BETA, companyAdmin.userId, {
      scenario: "Feature ON — insert workflow",
      actor: ACTORS.companyAdmin.label,
      featureState: "ON",
      expected: "ALLOW",
    });
    await testWorkflowInsert(runtimeExecute.client, COMPANY_BETA, runtimeExecute.userId, {
      scenario: "Feature ON — insert workflow",
      actor: ACTORS.runtimeExecute.label,
      featureState: "ON",
      expected: "ALLOW",
    });
    await testWorkflowInsert(viewOnly.client, COMPANY_BETA, viewOnly.userId, {
      scenario: "Feature ON — insert workflow",
      actor: ACTORS.viewOnly.label,
      featureState: "ON",
      expected: "DENY",
    });
    await testWorkflowInsert(noPermission.client, COMPANY_BETA, noPermission.userId, {
      scenario: "Feature ON — insert workflow",
      actor: ACTORS.noPermission.label,
      featureState: "ON",
      expected: "DENY",
    });

    await testWorkflowUpdate(companyAdmin.client, fixture.workflowId, {
      scenario: "Feature ON — update workflow",
      actor: ACTORS.companyAdmin.label,
      featureState: "ON",
      expected: "ALLOW",
    });
    await testWorkflowUpdate(runtimeExecute.client, fixture.workflowId, {
      scenario: "Feature ON — update workflow",
      actor: ACTORS.runtimeExecute.label,
      featureState: "ON",
      expected: "ALLOW",
    });
    await testWorkflowUpdate(viewOnly.client, fixture.workflowId, {
      scenario: "Feature ON — update workflow",
      actor: ACTORS.viewOnly.label,
      featureState: "ON",
      expected: "DENY",
    });

    await testChildInsert(runtimeExecute.client, "agent_workflow_events", {
      workflow_id: fixture.workflowId,
      company_id: COMPANY_BETA,
      event_type: "TaskStarted",
      payload: { probe: true },
    }, {
      scenario: "Feature ON — insert workflow event",
      actor: ACTORS.runtimeExecute.label,
      featureState: "ON",
      expected: "ALLOW",
    });
    await testChildInsert(viewOnly.client, "agent_workflow_events", {
      workflow_id: fixture.workflowId,
      company_id: COMPANY_BETA,
      event_type: "TaskStarted",
      payload: { probe: true },
    }, {
      scenario: "Feature ON — insert workflow event",
      actor: ACTORS.viewOnly.label,
      featureState: "ON",
      expected: "DENY",
    });

    await testChildInsert(runtimeExecute.client, "agent_workflow_checkpoints", {
      workflow_id: fixture.workflowId,
      company_id: COMPANY_BETA,
      checkpoint_index: 99,
      snapshot: { probe: true },
    }, {
      scenario: "Feature ON — insert workflow checkpoint",
      actor: ACTORS.runtimeExecute.label,
      featureState: "ON",
      expected: "ALLOW",
    });

    // ── DELETE manage split ───────────────────────────────────
    const { data: deleteProbe, error: deleteProbeErr } = await platform.client
      .from("agent_workflows")
      .insert({
        company_id: COMPANY_BETA,
        user_id: companyAdmin.userId,
        goal: "RLS delete probe",
        status: "planning",
        task_graph: {},
        memory: {},
        correlation_id: `delete-probe-${Date.now()}`,
      })
      .select("id")
      .single();
    if (deleteProbeErr || !deleteProbe) throw new Error(`delete probe fixture: ${deleteProbeErr?.message}`);
    deleteProbeWorkflowId = deleteProbe.id as string;

    await testWorkflowDelete(companyAdmin.client, deleteProbeWorkflowId, {
      scenario: "Feature ON — delete workflow with agents.manage",
      actor: ACTORS.companyAdmin.label,
      featureState: "ON",
      expected: "ALLOW",
    });
    deleteProbeWorkflowId = null;

    const { data: deleteDenyProbe, error: deleteDenyErr } = await platform.client
      .from("agent_workflows")
      .insert({
        company_id: COMPANY_BETA,
        user_id: runtimeExecute.userId,
        goal: "RLS delete deny probe",
        status: "planning",
        task_graph: {},
        memory: {},
        correlation_id: `delete-deny-${Date.now()}`,
      })
      .select("id")
      .single();
    if (deleteDenyErr || !deleteDenyProbe) throw new Error(`delete deny fixture: ${deleteDenyErr?.message}`);
    const deleteDenyId = deleteDenyProbe.id as string;

    await testWorkflowDelete(runtimeExecute.client, deleteDenyId, {
      scenario: "Feature ON — delete workflow without agents.manage",
      actor: ACTORS.runtimeExecute.label,
      featureState: "ON",
      expected: "DENY",
    });
    await platform.client.from("agent_workflows").delete().eq("id", deleteDenyId);

    // ── Feature OFF (requires writable ai_agents flag) ─────────
    if (featureFlagWritable) {
      const offResult = await setAgentsFeature(platform.client, platform.userId, COMPANY_BETA, false);
      if (!offResult.ok) {
        record({
          scenario: "Feature OFF setup",
          actor: ACTORS.superAdmin.label,
          table: "platform_ai_feature_flags",
          operation: "UPDATE",
          policy: "platform_ai_feature_flags_write (super-admin)",
          featureState: "OFF",
          expected: "ALLOW",
          actual: "DENY",
          detail: offResult.detail,
        });
      } else {
        const featureOff = await featureEnabled(companyAdmin.client, COMPANY_BETA);
        record({
          scenario: "Feature OFF precondition",
          actor: ACTORS.companyAdmin.label,
          table: "platform_ai_feature_flags",
          operation: "SELECT",
          policy: "platform_ai_feature_enabled(..., 'ai_agents')",
          featureState: "OFF",
          expected: "DENY",
          actual: featureOff ? "ALLOW" : "DENY",
          detail: `rpc=${featureOff}`,
        });

        await testSelect(companyAdmin.client, "agent_workflows", { id: fixture.workflowId }, {
          scenario: "Feature OFF — read workflow blocked by feature flag",
          actor: ACTORS.companyAdmin.label,
          featureState: "OFF",
          expected: "DENY",
        });
        await testWorkflowInsert(companyAdmin.client, COMPANY_BETA, companyAdmin.userId, {
          scenario: "Feature OFF — insert workflow blocked by feature flag",
          actor: ACTORS.companyAdmin.label,
          featureState: "OFF",
          expected: "DENY",
        });
        await testWorkflowUpdate(companyAdmin.client, fixture.workflowId, {
          scenario: "Feature OFF — update workflow blocked by feature flag",
          actor: ACTORS.companyAdmin.label,
          featureState: "OFF",
          expected: "DENY",
        });

        await setAgentsFeature(platform.client, platform.userId, COMPANY_BETA, true);
      }
    } else {
      for (const op of ["SELECT", "INSERT", "UPDATE"] as Operation[]) {
        record({
          scenario: `Feature OFF — ${op} blocked (skipped — ai_agents flag not writable)`,
          actor: ACTORS.companyAdmin.label,
          table: "agent_workflows",
          operation: op,
          policy: POLICIES.select,
          featureState: "OFF",
          expected: "DENY",
          actual: "ALLOW",
          detail: "blocked: migration 195 (ai_agents feature key) not applied on target DB",
        });
      }
    }

    // ── Tenant mismatch (Alpha admin vs Beta fixture) ─────────
    await testSelect(tenantOther.client, "agent_workflows", { id: fixture.workflowId }, {
      scenario: "Tenant mismatch — cross-company SELECT hidden",
      actor: ACTORS.tenantOther.label,
      featureState: "ON",
      expected: "DENY",
    });
    await testWorkflowInsert(tenantOther.client, COMPANY_BETA, tenantOther.userId, {
      scenario: "Tenant mismatch — INSERT into other company",
      actor: ACTORS.tenantOther.label,
      featureState: "ON",
      expected: "DENY",
    });

    // Super-admin cross-tenant read (bypass)
    await testSelect(platform.client, "agent_workflows", { id: fixture.workflowId }, {
      scenario: "Super Admin cross-tenant read bypass",
      actor: ACTORS.superAdmin.label,
      featureState: "ON",
      expected: "ALLOW",
    });
    }
  } finally {
    if (deleteProbeWorkflowId) {
      await platform.client.from("agent_workflows").delete().eq("id", deleteProbeWorkflowId);
    }
    if (fixture) {
      await deleteFixture(platform.client, fixture.workflowId);
    }

    if (agentsMigrationsApplied) {
      await revokeUserPermissions(platform.client, runtimeExecute.userId, permMap, [
        "agents.view",
        "agents.execute",
      ]);
      await revokeUserPermissions(platform.client, viewOnly.userId, permMap, ["agents.view"]);
    }

    if (originalFeatureEnabled === undefined) {
      if (featureFlagWritable) {
        await platform.client
          .from("platform_ai_feature_flags")
          .delete()
          .eq("company_id", COMPANY_BETA)
          .eq("feature_key", "ai_agents");
      }
    } else {
      const restore = await setAgentsFeature(platform.client, platform.userId, COMPANY_BETA, originalFeatureEnabled);
      if (!restore.ok) {
        console.warn(`Warning: could not restore ai_agents flag: ${restore.detail}`);
      }
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log(`\n=== Summary: ${passed}/${total} passed (${score}%) ===`);

  const reportDate = "2026-07-31";
  const reportPath = resolve(root, `docs/operations/agents-rls-e2e-validation-${reportDate}.md`);
  mkdirSync(dirname(reportPath), { recursive: true });

  const md = [
    "# AI Agent RLS Live E2E Validation Report",
    "",
    `**Sprint:** 6.2.5`,
    `**Date:** ${reportDate}`,
    `**Result:** ${passed}/${total} passed (${score}%)`,
    `**Issue target:** I-9 (RLS E2E for agent tables)`,
    "",
    "## Preconditions",
    "",
    "- Live Supabase project linked via `artifacts/login-app/.env.local`",
    "- Migrations `196`, `197`, and `198` applied",
    "- Demo personas available (`demo-platform`, `demo-beta-admin`, etc.)",
    "- Temporary `user_permissions` grants for View Only / Runtime Execute personas (restored after run)",
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Total scenarios | ${total} |`,
    `| Passed | ${passed} |`,
    `| Failed | ${total - passed} |`,
    `| I-9 status | ${passed === total ? "**CLOSED**" : "**OPEN** (see failures)"} |`,
    "",
    "## Detailed results",
    "",
    "| Result | Scenario | Actor | Table | Op | Feature | Policy | Expected | Actual | Detail |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.map((r) =>
      `| ${r.pass ? "PASS" : "FAIL"} | ${r.scenario} | ${r.actor} | ${r.table} | ${r.operation} | ${r.featureState} | ${r.policy.replace(/\|/g, "\\|")} | ${r.expected} | ${r.actual} | ${r.detail.replace(/\|/g, "\\|")} |`,
    ),
    "",
    "## Policies exercised",
    "",
    "- `agent_workflows_select` → `company_has_agents_access(company_id, 'agents.view')`",
    "- `agent_workflows_insert` / `agent_workflows_update` → `agents.execute`",
    "- `agent_workflows_delete` → `agents.manage`",
    "- `agent_workflow_events_select` / `agent_workflow_checkpoints_select` → `agents.view`",
    "- `agent_workflow_events_insert` / `agent_workflow_checkpoints_insert` → `agents.execute`",
    "",
    "*Generated by `scripts/agents-rls-e2e-validation.mts`. Failures are reported only — no automatic fixes.*",
    "",
  ].join("\n");

  writeFileSync(reportPath, md, "utf8");
  console.log(`Report written: ${reportPath}`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
