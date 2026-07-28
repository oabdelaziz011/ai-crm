/**
 * Sprint P3: EXPLAIN (ANALYZE, BUFFERS) for hot tenant-scoped queries.
 * Run: node scripts/sync-vite-env.mjs (login-app) && node scripts/db-explain-analyze.mjs
 *
 * Requires linked Supabase or DATABASE_URL; falls back to timing-only Supabase client queries.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/performance-profile");
mkdirSync(outDir, { recursive: true });

function loadEnv() {
  const env = {};
  for (const file of [
    resolve(root, "artifacts/login-app/.env.local"),
    resolve(root, ".env"),
  ]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const EMAIL = process.env.PROFILE_EMAIL ?? "demo-beta-admin@vaultos.local";
const PASSWORD = process.env.PROFILE_PASSWORD ?? "DemoVault2026!";

const QUERIES = [
  {
    domain: "customers",
    sql: `explain (analyze, buffers, format text)
select id, user_id, company_id, name, email, phone, age, gender, notes, created_at, updated_at
from public.customers
where company_id = $1
order by created_at desc
limit 50`,
  },
  {
    domain: "bookings",
    sql: `explain (analyze, buffers, format text)
select id, company_id, customer_id, service_id, resource_id, branch_id, start_at, end_at, status, created_at
from public.scheduling_bookings
where company_id = $1 and deleted_at is null
order by start_at asc
limit 50`,
  },
  {
    domain: "invoices",
    sql: `explain (analyze, buffers, format text)
select id, user_id, customer_id, company_id, amount, status, invoice_date, created_at
from public.invoices
where company_id = $1
order by invoice_date desc
limit 50`,
  },
  {
    domain: "audit_logs",
    sql: `explain (analyze, buffers, format text)
select id, user_id, company_id, action, entity, entity_id, created_at
from public.audit_logs
where company_id = $1
order by created_at desc
limit 50`,
  },
  {
    domain: "conversations",
    sql: `explain (analyze, buffers, format text)
select id, company_id, state, channel_type, last_message_at, created_at
from public.conversations
where company_id = $1 and deleted_at is null
order by last_message_at desc nulls last
limit 50`,
  },
  {
    domain: "profiles",
    sql: `explain (analyze, buffers, format text)
select id, email, full_name, company_id, is_active, created_at
from public.profiles
where company_id = $1
order by created_at desc
limit 50`,
  },
  {
    domain: "companies",
    sql: `explain (analyze, buffers, format text)
select id, name, status, subscription_status, created_at
from public.companies
order by created_at desc
limit 50`,
  },
  {
    domain: "rbac",
    sql: `explain (analyze, buffers, format text)
select p.id, p.code, p.category, p.module, p.action
from public.permissions p
order by p.code
limit 100`,
  },
  {
    domain: "knowledge",
    sql: `explain (analyze, buffers, format text)
select id, company_id, source_id, title, status, updated_at
from public.knowledge_documents
where company_id = $1
order by updated_at desc
limit 50`,
  },
];

async function resolveCompanyId(sb) {
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw error;
  const userId = auth.user?.id;
  const { data: profile } = await sb
    .from("profiles")
    .select("company_id")
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .maybeSingle();
  return profile?.company_id ?? null;
}

function runSupabaseDbQuery(sql, companyId) {
  const param = companyId ?? "null";
  const wrapped = sql.includes("$1")
    ? sql.replace(/\$1/g, `'${companyId}'::uuid`)
    : sql;
  const result = spawnSync("npx", ["supabase", "db", "query", wrapped, "--linked"], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function timingFallback(sb, companyId) {
  const { CUSTOMER_LIST_COLUMNS } = await import(
    "../artifacts/login-app/src/lib/crm/crm-query-columns.ts"
  ).catch(() => ({ CUSTOMER_LIST_COLUMNS: "id, name, created_at" }));

  const timings = [];

  async function timed(label, fn) {
    const t0 = performance.now();
    const { error } = await fn();
    timings.push({
      domain: label,
      ms: Math.round(performance.now() - t0),
      error: error?.message ?? null,
    });
  }

  await timed("customers", () =>
    sb.from("customers").select(CUSTOMER_LIST_COLUMNS).order("created_at", { ascending: false }).limit(50),
  );
  if (companyId) {
    await timed("bookings", () =>
      sb
        .from("scheduling_bookings")
        .select("id, company_id, customer_id, start_at, status")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("start_at", { ascending: true })
        .limit(50),
    );
    await timed("invoices", () =>
      sb
        .from("invoices")
        .select("id, company_id, amount, status, invoice_date")
        .eq("company_id", companyId)
        .order("invoice_date", { ascending: false })
        .limit(50),
    );
    await timed("audit_logs", () =>
      sb
        .from("audit_logs")
        .select("id, action, entity, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50),
    );
    await timed("conversations", () =>
      sb
        .from("conversations")
        .select("id, state, last_message_at")
        .eq("company_id", companyId)
        .order("last_message_at", { ascending: false })
        .limit(50),
    );
    await timed("profiles", () =>
      sb
        .from("profiles")
        .select("id, email, full_name")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50),
    );
    await timed("knowledge", () =>
      sb
        .from("knowledge_documents")
        .select("id, title, status, updated_at")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(50),
    );
  }
  await timed("rbac", () => sb.from("permissions").select("id, code").limit(100));
  await timed("companies", () => sb.from("companies").select("id, name, status").limit(50));

  return timings;
}

async function main() {
  const { createClient } = await import(
    "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
  );
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

  const companyId = await resolveCompanyId(sb);
  const report = {
    capturedAt: new Date().toISOString(),
    companyId,
    explain: [],
    timings: [],
  };

  for (const item of QUERIES) {
    if (item.sql.includes("$1") && !companyId) continue;
    const result = runSupabaseDbQuery(item.sql, companyId);
    report.explain.push({
      domain: item.domain,
      ok: result.ok,
      plan: result.stdout.trim() || result.stderr.trim(),
    });
  }

  report.timings = await timingFallback(sb, companyId);
  report.slowest = [...report.timings].sort((a, b) => b.ms - a.ms).slice(0, 10);

  const outPath = resolve(outDir, "db-explain-analyze-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log("Slowest queries (ms):", report.slowest.map((r) => `${r.domain}=${r.ms}`).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
