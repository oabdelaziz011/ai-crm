/**
 * LOCAL ONLY — revalidate open Opportunity identity for the approval manifest.
 * Read-only. Never mutates rows.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../../lib/db/node_modules/pg/lib/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outPath = resolve(dirname(fileURLToPath(import.meta.url)), "approval-manifest.json");

const raw = readFileSync(resolve(root, ".env.localstack"), "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):54322\//.test(url)) {
  throw new Error(`Refusing non-local DB: ${url}`);
}

const db = new pg.Client({ connectionString: url });
await db.connect();

const summary = await db.query(`
  select
    count(*)::int as open_total,
    count(*) filter (where customer_id is null)::int as null_customer,
    count(*) filter (where primary_product_id is null)::int as null_product,
    count(*) filter (where customer_id is null and primary_product_id is null)::int as both_null,
    count(*) filter (where customer_id is not null and primary_product_id is not null)::int as fully_scoped
  from public.opportunities
  where deleted_at is null and won_at is null and lost_at is null
`);

const rows = await db.query(`
  select
    o.id::text as opportunity_id,
    o.company_id::text as company_id,
    o.lead_id::text as lead_id,
    o.customer_id::text as customer_id,
    o.primary_product_id::text as primary_product_id,
    o.created_from_lead,
    o.deleted_at is not null as is_soft_deleted,
    o.won_at is not null as is_won,
    o.lost_at is not null as is_lost,
    o.stage_id::text as stage_id,
    s.stage_key as stage_key,
    s.name as stage_name,
    o.metadata->>'identityScope' as identity_scope,
    o.metadata->>'createdFrom' as meta_created_from,
    o.updated_at as opportunity_updated_at,
    o.created_at as opportunity_created_at,
    l.id::text as lead_exists_id,
    l.customer_id::text as lead_customer_id,
    l.company_id::text as lead_company_id,
    l.deleted_at is not null as lead_soft_deleted,
    l.lifecycle_status as lead_lifecycle,
    exists (
      select 1 from public.customers c
      where c.id = l.customer_id and c.company_id = o.company_id
    ) as lead_customer_in_company,
    exists (
      select 1 from public.customers c
      where c.id = o.customer_id and c.company_id = o.company_id
    ) as opp_customer_in_company,
    exists (
      select 1 from public.catalog_products p
      where p.id = o.primary_product_id
        and p.company_id = o.company_id
        and p.deleted_at is null
    ) as opp_product_in_company,
    (
      select count(distinct li.product_id)::int
      from public.opportunity_line_items li
      where li.opportunity_id = o.id
        and li.deleted_at is null
        and li.product_id is not null
    ) as distinct_line_products
  from public.opportunities o
  left join public.opportunity_stages s
    on s.id = o.stage_id and s.company_id = o.company_id
  left join public.leads l on l.id = o.lead_id
  where o.deleted_at is null
    and o.won_at is null
    and o.lost_at is null
    and (o.customer_id is null or o.primary_product_id is null)
  order by o.created_at asc
`);

await db.end();

console.log("SUMMARY", JSON.stringify(summary.rows[0], null, 2));
console.log("ROW_COUNT", rows.rows.length);
writeFileSync(outPath, JSON.stringify({ capturedAt: new Date().toISOString(), summary: summary.rows[0], rows: rows.rows }, null, 2));
console.log("WROTE", outPath);
