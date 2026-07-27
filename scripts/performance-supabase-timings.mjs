/**
 * Supabase + auth chain timing (no browser required).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/performance-profile");
mkdirSync(outDir, { recursive: true });

const env = {};
for (const line of readFileSync(resolve(root, "artifacts/login-app/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const EMAIL = process.env.PROFILE_EMAIL ?? "demo-beta-admin@vaultos.local";
const PASSWORD = process.env.PROFILE_PASSWORD ?? "DemoVault2026!";

async function timed(label, fn) {
  const t0 = performance.now();
  try {
    await fn();
    return { label, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { label, ms: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e) };
  }
}

const { createClient } = await import(
  "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const results = [];

results.push(
  await timed("auth.signInWithPassword", async () => {
    const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw error;
  }),
);

const userId = (await sb.auth.getUser()).data.user?.id ?? "";

results.push(
  await timed("profiles.select (auth bootstrap step 1)", async () => {
    const { error } = await sb.from("profiles").select("id, company_id, full_name, is_super_admin").eq("id", userId).maybeSingle();
    if (error) throw error;
  }),
);

const profile = (await sb.from("profiles").select("company_id").eq("id", userId).maybeSingle()).data;
const companyId = profile?.company_id;

results.push(
  await timed("companies.select (auth bootstrap step 2)", async () => {
    if (!companyId) return;
    const { error } = await sb
      .from("companies")
      .select("id, name, logo_url, status, subscription_status, billing_cycle, subscription_expires_at")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw error;
  }),
);

results.push(
  await timed("user_roles + roles + role_permissions + permissions (auth chain)", async () => {
    const { data: userRoleRows } = await sb.from("user_roles").select("role_id").eq("user_id", userId);
    const roleIds = (userRoleRows ?? []).map((r) => r.role_id).filter(Boolean);
    if (roleIds.length === 0) return;
    await sb.from("roles").select("id, company_id, name, description, is_system").in("id", roleIds);
    const { data: rp } = await sb.from("role_permissions").select("permission_id").in("role_id", roleIds);
    const permIds = [...new Set((rp ?? []).map((r) => r.permission_id).filter(Boolean))];
    const { data: up } = await sb.from("user_permissions").select("permission_id").eq("user_id", userId);
    for (const row of up ?? []) if (row.permission_id) permIds.push(row.permission_id);
    const unique = [...new Set(permIds)];
    if (unique.length) await sb.from("permissions").select("id, category, module, action, code, description").in("id", unique);
  }),
);

results.push(
  await timed("rpc.load_user_auth_context", async () => {
    const { error } = await sb.rpc("load_user_auth_context", { p_user_id: userId });
    if (error) throw error;
  }),
);

results.push(
  await timed("auth.loadAuthContext sequential total (legacy)", async () => {
    await sb.from("profiles").select("id, company_id, full_name, is_super_admin").eq("id", userId).maybeSingle();
    if (companyId) {
      await sb.from("companies").select("id, name, logo_url, status, subscription_status, billing_cycle, subscription_expires_at").eq("id", companyId).maybeSingle();
    }
    const { data: ur } = await sb.from("user_roles").select("role_id").eq("user_id", userId);
    const rids = (ur ?? []).map((r) => r.role_id).filter(Boolean);
    if (rids.length) {
      await sb.from("roles").select("id, company_id, name, description, is_system").in("id", rids);
      const { data: rp } = await sb.from("role_permissions").select("permission_id").in("role_id", rids);
      const pids = [...new Set((rp ?? []).map((r) => r.permission_id).filter(Boolean))];
      if (pids.length) await sb.from("permissions").select("id, category, module, action, code, description").in("id", pids);
    }
    await sb.from("user_permissions").select("permission_id").eq("user_id", userId);
  }),
);

results.push(
  await timed("customers.select(projected columns)", async () => {
    const { error } = await sb
      .from("customers")
      .select("id, user_id, company_id, name, email, phone, age, gender, notes, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
  }),
);

results.push(
  await timed("bookings.select(*, customers join)", async () => {
    const { error } = await sb.from("bookings").select("*, customers(id, name)").eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) throw error;
  }),
);

results.push(
  await timed("invoices.select(*, customers join)", async () => {
    const { error } = await sb.from("invoices").select("*, customers(id, name)").order("invoice_date", { ascending: false });
    if (error) throw error;
  }),
);

results.push(
  await timed("rpc.platform_resolve_ai_runtime_config", async () => {
    const { error } = await sb.rpc("platform_resolve_ai_runtime_config", {
      p_company_id: companyId,
      p_provider_key: "openai",
      p_use_case: "chat",
    });
    if (error) throw error;
  }),
);

results.push(
  await timed("notifications.unread count", async () => {
    const { error } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) throw error;
  }),
);

const authChainStart = performance.now();
await sb.rpc("load_user_auth_context", { p_user_id: userId });
results.push({ label: "auth.loadAuthContext RPC total", ms: Math.round(performance.now() - authChainStart) });

writeFileSync(resolve(outDir, "supabase-timings.json"), JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
