/**
 * Seed a safe pending company for Phase 5 browser verification (not a production tenant).
 * Run: node scripts/seed-phase5-pending-company.mjs
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const name = `Phase5 Browser Pending ${new Date().toISOString().slice(0, 16)}`;

await client.connect();
try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  const r = await client.query(
    `
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      business_type, industry, contact_person, contact_email, contact_phone,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      $1, 'Trial', 'Basic', 'trialing', 'tenant',
      'clinic', 'healthcare', 'Phase5 Reviewer', 'phase5.pending@example.com', '+966500000055',
      'pending', now(), 'completed'
    )
    returning id, name, approval_status, status
    `,
    [name],
  );
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [r.rows[0].id]);
  await client.query("commit");
  console.log(JSON.stringify(r.rows[0], null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  throw error;
} finally {
  await client.end();
}
