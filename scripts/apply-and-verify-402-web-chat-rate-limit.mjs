/**
 * Apply + verify migration 402 (shared Web Chat rate-limit buckets). LOCAL ONLY.
 * Run: node scripts/apply-and-verify-402-web-chat-rate-limit.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve("D:/ValueOR/project");
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");
if (!/@(127\.0\.0\.1|localhost):54322\b/.test(env.DATABASE_URL)) {
  throw new Error("Refusing: DATABASE_URL is not local");
}

const version = "402";
const migrationName = "402_web_chat_shared_rate_limit.sql";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
try {
  const exists = await c.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [version]);
  await c.query(sql);
  if (exists.rowCount === 0) {
    await c.query(`insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`, [
      version,
      migrationName,
    ]);
    console.log("APPLIED_402");
  } else {
    console.log("402_IDEMPOTENT_REAPPLY");
  }

  const table = await c.query(
    `select exists(select 1 from information_schema.tables where table_schema='public' and table_name='web_chat_rate_limit_buckets') as ok`,
  );
  if (!table.rows[0].ok) throw new Error("web_chat_rate_limit_buckets missing");

  const key = `verify-402-${Date.now()}`;
  const a = await c.query(`select public.web_chat_rate_limit_consume($1, 1, 60000) as d`, [key]);
  const b = await c.query(`select public.web_chat_rate_limit_consume($1, 1, 60000) as d`, [key]);
  if (a.rows[0].d.allowed !== true) throw new Error("first consume should allow");
  if (b.rows[0].d.allowed !== false) throw new Error("second consume should deny");

  await c.query("begin");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]);
  await c.query(`set local role anon`);
  try {
    await c.query(`select public.web_chat_rate_limit_consume('anon-should-fail', 1, 60000)`);
    await c.query("rollback");
    throw new Error("anon must not execute consume");
  } catch (error) {
    await c.query("rollback");
    if (String(error.message).includes("anon must not")) throw error;
    console.log("ANON_DENIED");
  }
  console.log("VERIFY_402_OK");
} finally {
  await c.end();
}
