/**
 * Phase 7.8 — subscription lifecycle enforcement worker (CLI).
 *
 * Invokes run_subscription_lifecycle_enforcement_v1 as service_role.
 * Does NOT collect payment or fabricate renewals.
 *
 * Usage:
 *   node scripts/run-subscription-lifecycle-enforcement.mjs
 *   node scripts/run-subscription-lifecycle-enforcement.mjs --limit=50
 *
 * Cron-friendly: exit 0 on success; prints JSON summary.
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
if (!env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = Math.max(1, Math.min(500, Number(limitArg?.split("=")[1] ?? 100) || 100));

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  const result = await client.query(
    `select public.run_subscription_lifecycle_enforcement_v1($1) as r`,
    [limit],
  );
  console.log(JSON.stringify(result.rows[0].r, null, 2));
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
