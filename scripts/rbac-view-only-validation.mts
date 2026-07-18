/**
 * Validate frontend permission resolution matches DB RPC after auth bootstrap.
 * Run: tsx scripts/rbac-view-only-validation.mts
 *
 * Requires migration 116 applied. Without it, non-admin personas fail with 0 codes.
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

const VIEW_ONLY_SCENARIOS = [
  {
    email: "demo-support@vaultos.local",
    label: "Support (customers + ai_chat)",
    expectView: ["customers.view", "ai_chat.view"],
    expectDeny: ["users.view", "users.edit", "roles.view", "companies.view", "billing.view", "knowledge.view"],
  },
  {
    email: "demo-beta-admin@vaultos.local",
    label: "Company Admin (full admin set)",
    expectView: ["users.view", "users.edit", "roles.view", "companies.view", "billing.view", "knowledge.view", "ai_chat.view"],
    expectDeny: [] as string[],
  },
];

async function loadAuthContextPermissions(client: ReturnType<typeof createClient>, userId: string) {
  const { data: userRoles } = await client.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (userRoles ?? []).map((r) => r.role_id).filter(Boolean);

  const permissionIds = new Set<string>();
  if (roleIds.length > 0) {
    const { data: rpRows } = await client.from("role_permissions").select("permission_id").in("role_id", roleIds);
    (rpRows ?? []).forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
  }

  const { data: upRows } = await client.from("user_permissions").select("permission_id").eq("user_id", userId);
  (upRows ?? []).forEach((r) => r.permission_id && permissionIds.add(r.permission_id));

  const ids = Array.from(permissionIds);
  if (ids.length === 0) return [] as string[];

  const { data: permRows, error } = await client.from("permissions").select("code").in("id", ids);
  if (error) throw new Error(`permissions SELECT failed: ${error.message}`);
  return (permRows ?? []).map((p) => p.code).filter(Boolean) as string[];
}

function hasPermission(codes: string[], code: string) {
  return codes.includes(code);
}

async function validatePersona(email: string, label: string, expectView: string[], expectDeny: string[]) {
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) throw new Error(`${email}: ${signInErr.message}`);

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("missing user id");

  const codes = await loadAuthContextPermissions(client, userId);
  console.log(`\n=== ${label} ===`);
  console.log(`AuthContext permission codes (${codes.length}): ${codes.join(", ") || "(empty)"}`);

  let failed = 0;
  for (const code of expectView) {
    const frontend = hasPermission(codes, code);
    const { data: rpc } = await client.rpc("user_has_permission", { p_code: code });
    const ok = frontend === true && rpc === true;
    console.log(`  ${ok ? "✓" : "✗"} expect ${code}: frontend=${frontend} rpc=${rpc}`);
    if (!ok) failed++;
  }
  for (const code of expectDeny) {
    const frontend = hasPermission(codes, code);
    const { data: rpc } = await client.rpc("user_has_permission", { p_code: code });
    const ok = frontend === false && rpc === false;
    console.log(`  ${ok ? "✓" : "✗"} deny ${code}: frontend=${frontend} rpc=${rpc}`);
    if (!ok) failed++;
  }

  return failed;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  console.log("RBAC View-Only Validation (simulates AuthContext + hasPermission)");
  let totalFailed = 0;
  for (const s of VIEW_ONLY_SCENARIOS) {
    totalFailed += await validatePersona(s.email, s.label, s.expectView, s.expectDeny);
  }

  console.log(`\n${totalFailed === 0 ? "PASS" : `FAIL (${totalFailed} checks)`}`);
  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
