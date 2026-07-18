/**
 * Verify migration 116 / permissions_select_policy on LIVE database only.
 * Run: tsx scripts/verify-migration-116-live.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const paths = [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")];
  const env: Record<string, string> = {};
  for (const p of paths) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const PASSWORD = "DemoVault2026!";

async function tryMigrationHistory(client: ReturnType<typeof createClient>) {
  const attempts: { label: string; ok: boolean; detail: string }[] = [];

  for (const table of ["schema_migrations", "supabase_migrations"]) {
    const { data, error } = await client.from(table).select("*").limit(5);
    attempts.push({
      label: `public.${table}`,
      ok: !error,
      detail: error ? error.message : `rows=${data?.length ?? 0}`,
    });
  }

  const { data: rpc116, error: rpc116Err } = await client.rpc("116_rbac_permissions_select_fix" as never);
  attempts.push({
    label: "rpc probe",
    ok: !rpc116Err,
    detail: rpc116Err?.message ?? "exists",
  });

  return attempts;
}

async function probePolicyViaBehavior() {
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({
    email: "demo-employee@vaultos.local",
    password: PASSWORD,
  });
  const { data: userData } = await client.auth.getUser();
  const userId = userData.user!.id;

  const { data: userRoles } = await client.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (userRoles ?? []).map((r) => r.role_id);
  const { data: rpRows } = await client
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", roleIds);
  const assignedIds = [...new Set((rpRows ?? []).map((r) => r.permission_id).filter(Boolean))];

  const { data: permById, error: byIdErr } = await client
    .from("permissions")
    .select("id, code")
    .in("id", assignedIds);

  const { count: totalVisible, error: countErr } = await client
    .from("permissions")
    .select("id", { count: "exact", head: true });

  const { data: rolesViewPerm } = await client.rpc("user_has_permission", { p_code: "roles.view" });

  const returned = permById?.length ?? 0;
  const assigned = assignedIds.length;

  let policyVersion: "113 (roles.view gate)" | "116 (assigned-row EXISTS)" | "004 (open catalog)" | "unknown";
  if (returned === 0 && assigned > 0 && !rolesViewPerm) {
    policyVersion = "113 (roles.view gate)";
  } else if (returned === assigned && assigned > 0 && !rolesViewPerm) {
    policyVersion = "116 (assigned-row EXISTS)";
  } else if ((totalVisible ?? 0) > assigned && !rolesViewPerm) {
    policyVersion = "004 (open catalog)";
  } else {
    policyVersion = "unknown";
  }

  return {
    userId,
    assignedPermissionIds: assigned,
    returnedForAssignedIds: returned,
    totalPermissionsVisible: countErr ? `error: ${countErr.message}` : totalVisible,
    hasRolesView: rolesViewPerm,
    byIdErr: byIdErr?.message ?? null,
    inferredPolicy: policyVersion,
    sampleCodes: (permById ?? []).map((p) => p.code),
  };
}

async function probePolicyDefinitionRpc(client: ReturnType<typeof createClient>) {
  const candidates = [
    "get_permissions_select_policy",
    "inspect_permissions_select_policy",
    "pg_get_policies",
  ];
  const results: string[] = [];
  for (const fn of candidates) {
    const { error } = await client.rpc(fn as never);
    if (!error) results.push(`${fn}: callable`);
    else results.push(`${fn}: ${error.message}`);
  }
  return results;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  console.log("=== LIVE DB: Migration 116 Verification ===");
  console.log(`Project: ${SUPABASE_URL}\n`);

  const anon = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("--- 1. Migration history (direct table access) ---");
  const historyAttempts = await tryMigrationHistory(anon);
  for (const a of historyAttempts) {
    console.log(`  ${a.label}: ${a.ok ? "accessible" : "NOT accessible"} — ${a.detail}`);
  }
  console.log(
    "  Note: supabase_migrations.schema_migrations is not exposed via PostgREST with anon key.",
  );

  console.log("\n--- 2. permissions_select_policy (behavioral probe) ---");
  const behavior = await probePolicyViaBehavior();
  console.log(JSON.stringify(behavior, null, 2));

  console.log("\n--- 3. Policy definition RPC probes ---");
  const rpcs = await probePolicyDefinitionRpc(anon);
  for (const line of rpcs) console.log(`  ${line}`);

  console.log("\n=== CONCLUSION ===");
  const m116Applied =
    behavior.inferredPolicy === "116 (assigned-row EXISTS)" &&
    behavior.returnedForAssignedIds === behavior.assignedPermissionIds &&
    behavior.assignedPermissionIds > 0;

  console.log(`Migration 116 applied (behavioral): ${m116Applied ? "YES" : "NO"}`);
  console.log(`Policy behaves as migration 113: ${behavior.inferredPolicy === "113 (roles.view gate)" ? "YES" : "NO"}`);

  const hasExistsSemantics =
    behavior.inferredPolicy === "116 (assigned-row EXISTS)" ||
    (behavior.returnedForAssignedIds > 0 &&
      !behavior.hasRolesView &&
      behavior.returnedForAssignedIds === behavior.assignedPermissionIds);

  console.log(`permissions_select_policy has role/user assigned EXISTS semantics: ${hasExistsSemantics ? "YES (inferred)" : "NO (inferred — still 113 gate)"}`);

  process.exit(m116Applied ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
