/**
 * Diagnose CRM RLS after migration 167.
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { loadSupabaseEnv, resolveProjectRoot, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadSupabaseEnv(root);
const config = resolveSupabaseConfig(env);
const databaseUrl = env.DATABASE_URL!;

async function connectPg() {
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
  const host = parsed.hostname;
  const password = parsed.password;
  const projectRef = host.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ?? "lfbtnskmvibikalsxwsm";
  const region = "eu-north-1";
  const poolerSession = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
  const client = new pg.Client({ connectionString: poolerSession, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function main() {
  const alpha = createClient(config!.url, config!.key, { auth: { persistSession: false } });
  await alpha.auth.signInWithPassword({ email: "demo-alpha-admin@vaultos.local", password: "DemoVault2026!" });
  const uid = (await alpha.auth.getUser()).data.user!.id;

  const { data: profile } = await alpha.from("profiles").select("id, user_id, company_id").or(`id.eq.${uid},user_id.eq.${uid}`).maybeSingle();
  const { data: isSuper } = await alpha.rpc("is_super_admin");
  const { data: hasView } = await alpha.rpc("user_has_permission", { p_code: "customers.view" });
  const { data: customers, count } = await alpha.from("customers").select("id, company_id, name", { count: "exact" }).limit(3);

  console.log("Alpha session:", { uid, profile, isSuper, hasView, customerCount: count, sample: customers });

  const { data: ccid } = await alpha.rpc("current_company_id" as never).then((r) => r).catch(() => ({ data: null }));
  console.log("current_company_id rpc:", ccid);

  const client = await connectPg();

  const { rows: policies } = await client.query(`
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'customers'
    order by policyname
  `);
  console.log("\nCustomer policies:", policies.length);
  for (const p of policies) {
    console.log("\n===", p.policyname, p.cmd, "===");
    console.log("qual:", p.qual);
    console.log("with_check:", p.with_check);
  }

  const { rows: rls } = await client.query(`
    select relrowsecurity, relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'customers'
  `);
  console.log("\nRLS enabled:", rls[0]);

  const { rows: fn } = await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_company_id'
    limit 1
  `);
  console.log("\ncurrent_company_id def (first 500 chars):", fn[0]?.def?.slice(0, 500));

  const { rows: dist } = await client.query(`
    select company_id, count(*)::int as n from public.customers group by company_id order by n desc
  `);
  console.log("\nCustomer company_id distribution:", dist);

  await client.end();
}

main().catch(console.error);
