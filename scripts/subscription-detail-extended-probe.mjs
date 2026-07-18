import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
await client.auth.signInWithPassword({ email: "demo-platform@vaultos.local", password: "DemoVault2026!" });

const { data: companies } = await client
  .from("companies")
  .select("id,name")
  .eq("company_type", "demo")
  .order("name")
  .limit(2);

const out = { companies: [] };
for (const co of companies ?? []) {
  const id = co.id;
  const [inv, pay, rec, usage, sub] = await Promise.all([
    client.from("billing_invoices").select("id", { count: "exact", head: true }).eq("company_id", id),
    client.from("billing_payments").select("id", { count: "exact", head: true }).eq("company_id", id),
    client.from("billing_receipts").select("id", { count: "exact", head: true }).eq("company_id", id),
    client.from("company_usage_snapshots").select("id").eq("company_id", id).limit(1).maybeSingle(),
    client.from("company_subscriptions").select("id,plan_id,billing_cycle").eq("company_id", id).maybeSingle(),
  ]);
  const { data: currency } = await client.rpc("get_billing_setting", {
    p_code: "default_currency",
    p_company_id: id,
  });
  const { data: entitlements, error: entErr } = await client.rpc("get_company_entitlements", {
    p_company_id: id,
  });
  const { error: payOptsErr } = await client.rpc("get_billing_payment_options_v1", { p_company_id: id });
  const { error: auditErr } = await client.rpc("list_billing_audit_logs_paged", {
    p_limit: 5,
    p_offset: 0,
    p_search: null,
    p_event_type: null,
    p_for_export: false,
    p_company_id: id,
  });
  out.companies.push({
    name: co.name,
    invoices: inv.count ?? 0,
    payments: pay.count ?? 0,
    receipts: rec.count ?? 0,
    usageSnapshot: Boolean(usage.data),
    currency: currency ?? null,
    entitlements: entErr ? entErr.message : (entitlements?.length ?? 0),
    paymentOptionsRpc: payOptsErr ? payOptsErr.message.slice(0, 80) : "ok",
    auditRpc: auditErr ? auditErr.message.slice(0, 80) : "ok",
    subscriptionId: sub.data?.id ?? null,
  });
}

console.log(JSON.stringify(out, null, 2));
