/**
 * Local-only: apply migration 474 to local Supabase Postgres.
 * Never run against production.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(root, "supabase/migrations/474_update_my_profile_allow_german.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const connectionString =
  process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!/127\.0\.0\.1|localhost/.test(connectionString) || /supabase\.co|pooler\.supabase/i.test(connectionString)) {
  throw new Error("Refusing to apply migration 474 against a production DATABASE_URL.");
}

const c = new pg.Client({ connectionString });
await c.connect();
try {
  await c.query("begin");
  await c.query(sql);
  const body = await c.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'update_my_profile' and n.nspname = 'internal'
  `);
  const def = body.rows[0]?.def ?? "";
  const allowsDe = /not in \('en', 'ar', 'de'\)/.test(def);
  if (!allowsDe) {
    throw new Error("Expected update_my_profile to allow en/ar/de");
  }
  await c.query("commit");
  console.log(JSON.stringify({ ok: true, allowsDe: true }, null, 2));
} catch (error) {
  await c.query("rollback");
  throw error;
} finally {
  await c.end();
}
