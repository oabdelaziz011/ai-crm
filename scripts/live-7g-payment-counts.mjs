import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
const COMPANY_ID = "7f017b82-20ab-4fb1-84ca-f686e1d026b8";
const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
for (const table of ["billing_checkout_sessions", "payment_intents"]) {
  const cols = await c.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
    [table],
  );
  console.log(table, "cols", cols.rows.map((r) => r.column_name));
  const n = await c.query(`select count(*)::int as n from public.${table}`);
  console.log(table, "total", n.rows[0].n);
  const hasCompany = cols.rows.some((r) => r.column_name === "company_id");
  if (hasCompany) {
    const mine = await c.query(`select count(*)::int as n from public.${table} where company_id=$1`, [COMPANY_ID]);
    console.log(table, "this_company", mine.rows[0].n);
  }
}
await c.end();
