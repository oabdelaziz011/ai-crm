import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

function loadEnv() {
  const env: Record<string, string> = {};
  const root = resolve(import.meta.dirname, "..");
  for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "";
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";

console.log("=== Q2/Q3: Supabase project ===");
console.log("VITE_SUPABASE_URL (login-app):", env.VITE_SUPABASE_URL ?? "(missing)");
console.log("Seed script uses same files: artifacts/login-app/.env.local then .env");
console.log("Resolved URL:", url);
console.log("Project ref:", url.match(/https:\/\/([^.]+)/)?.[1] ?? "(unknown)");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

console.log("\n=== Q1: Row exists? (service role, bypass RLS) ===");
const { data: allRows, error: allErr } = await admin
  .from("ai_employees")
  .select("id,name,display_name,status,company_id,owner_id,deleted_at,published_version_id")
  .order("created_at", { ascending: true });
if (allErr) {
  console.log("ERROR:", allErr.message, allErr.code);
} else {
  console.log("Row count:", allRows?.length ?? 0);
  for (const row of allRows ?? []) {
    console.log(JSON.stringify(row));
  }
}

const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await anonClient.auth.signInWithPassword({
  email: "demo-beta-admin@vaultos.local",
  password: "DemoVault2026!",
});
if (authErr) {
  console.error("AUTH FAIL:", authErr.message);
  process.exit(1);
}

const userClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${auth.session!.access_token}` } },
});

const { data: profile } = await userClient
  .from("profiles")
  .select("id,company_id,full_name,email")
  .eq("id", auth.user!.id)
  .single();

console.log("\n=== Q5: Logged-in demo-beta-admin ===");
console.log(JSON.stringify({ userId: auth.user!.id, email: auth.user!.email, profile }, null, 2));

const companyId = profile?.company_id as string | undefined;
const seeded = allRows?.find((r) => r.display_name === "Customer Support AI" || r.name === "customer-support-ai");

console.log("\n=== Q4/Q6: Seeded employee company ===");
if (seeded) {
  console.log("Employee company_id:", seeded.company_id);
  console.log("User company_id:", companyId);
  console.log("Same tenant?", seeded.company_id === companyId);
} else {
  console.log("Customer Support AI row NOT FOUND in database");
}

console.log("\n=== Q7: RLS test as logged-in user ===");
const uiQuery = userClient
  .from("ai_employees")
  .select("*")
  .eq("company_id", companyId!)
  .is("deleted_at", null)
  .order("updated_at", { ascending: false })
  .limit(26);

const { data: userRows, error: userErr } = await uiQuery;
if (userErr) {
  console.log("RLS/Query ERROR:", userErr.message, userErr.code, userErr.details, userErr.hint);
} else {
  console.log("Visible rows (UI-equivalent query):", userRows?.length ?? 0);
  for (const row of userRows ?? []) {
    console.log(JSON.stringify({ id: row.id, name: row.name, display_name: row.display_name, status: row.status }));
  }
}

console.log("\n=== Q7b: ai_agents feature + agents.view permission ===");
const { data: features } = await admin
  .from("platform_company_features")
  .select("feature_key,is_enabled")
  .eq("company_id", companyId!);
console.log("platform_company_features:", JSON.stringify(features));

const { data: rolePerms } = await admin
  .from("role_permissions")
  .select("roles(name,is_system),permissions(code)")
  .eq("roles.company_id", companyId!);
// simpler: query user permissions via RPC if exists

const { data: permCheck } = await admin.rpc("company_has_agents_access", {
  p_company_id: companyId,
  p_permission: "agents.view",
});
console.log("company_has_agents_access(company, agents.view) [service role]:", permCheck);

// Test as user via raw select without company filter (RLS only)
const { data: rlsOnly } = await userClient.from("ai_employees").select("id,name,company_id,status");
console.log("User JWT rows without company filter (RLS only):", rlsOnly?.length ?? 0, rlsOnly);

console.log("\n=== Q9: Exact PostgREST request (AI Employees page) ===");
console.log(
  `GET ${url}/rest/v1/ai_employees?select=*&company_id=eq.${companyId}&deleted_at=is.null&order=updated_at.desc&limit=26`,
);
console.log("Headers: Authorization: Bearer <demo-beta-admin access token>, apikey: <publishable key>");

// Q8: Repository filter simulation
console.log("\n=== Q8: Repository filters (default UI filter {}) ===");
console.log("Default filter: {} -> no status filter, deleted_at IS NULL only");
const draftOnly = await userClient
  .from("ai_employees")
  .select("id")
  .eq("company_id", companyId!)
  .is("deleted_at", null)
  .eq("status", "draft");
console.log("If status=draft filter:", draftOnly.data?.length ?? 0, "rows");

// Simulate companyId null (query disabled in UI)
console.log("\n=== UI companyId null scenario ===");
console.log("useAiEmployees enabled=false when company?.id is null -> React Query returns default []");

// Permissions for demo user
const { data: userRoles } = await admin
  .from("user_roles")
  .select("role_id, roles(name, company_id)")
  .eq("user_id", auth.user!.id);
console.log("\n=== demo-beta-admin roles ===");
console.log(JSON.stringify(userRoles, null, 2));

const roleIds = (userRoles ?? []).map((r) => r.role_id);
const { data: userRolePerms } = await admin
  .from("role_permissions")
  .select("permissions(code)")
  .in("role_id", roleIds);
const permCodes = (userRolePerms ?? [])
  .map((row) => (row.permissions as { code?: string } | null)?.code)
  .filter(Boolean);
console.log("Permission codes:", permCodes.join(", "));
console.log("Has agents.view?", permCodes.includes("agents.view"));

const { data: featureEnabled } = await admin.rpc("platform_ai_feature_enabled", {
  p_company_id: companyId,
  p_feature_key: "ai_agents",
});
console.log("platform_ai_feature_enabled(ai_agents):", featureEnabled);

// Auth bootstrap path used by UI
const { data: authBootstrap, error: bootstrapErr } = await userClient.rpc("load_user_auth_context", {
  p_user_id: auth.user!.id,
});
console.log("\n=== Auth bootstrap (load_user_auth_context) ===");
if (bootstrapErr) console.log("RPC error:", bootstrapErr.message);
else {
  const payload = authBootstrap as { profile?: { company_id?: string }; company?: { id?: string } | null };
  console.log("profile.company_id:", payload?.profile?.company_id ?? null);
  console.log("company.id (used by UI as company?.id):", payload?.company?.id ?? null);
  console.log("company object:", JSON.stringify(payload?.company ?? null));
}

// Application layer list (exact UI path)
const { createAiEmployeeServices } = await import("../artifacts/login-app/src/lib/ai-employees/index.ts");
const userAuthedClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${auth.session!.access_token}` } },
});
const services = createAiEmployeeServices(userAuthedClient);
const listed = await services.registry.list(companyId!, {});
console.log("\n=== Application registry.list(companyId, {}) ===");
console.log("Count:", listed.length);
for (const e of listed) {
  console.log(JSON.stringify({ id: e.id, name: e.name, displayName: e.displayName, status: e.status }));
}


