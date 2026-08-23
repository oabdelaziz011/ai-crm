import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const client = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const tables = [
  "company_feature_overrides",
  "company_resource_limits",
  "company_usage_limit_overrides",
  "billing_audit_logs",
  "payments",
  "profiles",
  "company_subscriptions",
];
for (const table of tables) {
  const res = await client.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
    [table],
  );
  console.log(table, res.rows.length ? res.rows.map((r) => r.column_name).join(",") : "MISSING");
}
const fns = await client.query(
  `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname ilike '%occupancy%'`,
);
console.log("occupancy_fns", fns.rows.map((r) => r.proname));
const occCols = await client.query(
  `select column_name from information_schema.columns where table_schema='public' and table_name='company_resource_limits'`,
);
console.log("resource_limit_cols", occCols.rows.map((r) => r.column_name));
await client.end();
