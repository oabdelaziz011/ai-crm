import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const companyId = (await c.query(`select id from public.companies where name='شركة عمر' limit 1`)).rows[0].id;
const u = (
  await c.query(
    `select id, user_id, email, is_super_admin from public.profiles
     where coalesce(is_super_admin,false)=false and email is not null limit 1`,
  )
).rows[0];
const uid = u.user_id || u.id;
console.log("impersonating", u.email, "super", u.is_super_admin);
await c.query("begin");
await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
await c.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
await c.query("select set_config('role', 'authenticated', true)");
try {
  const r = await c.query(
    `select public.configure_company_custom_package_v1($1::uuid,'x','monthly',1,1,'n',array['ticketing']::text[],1,1,'[]'::jsonb)`,
    [companyId],
  );
  console.log("FAIL allow", r.rows[0]);
} catch (error) {
  console.log("PASS deny", String(error.message).slice(0, 220));
}
await c.query("rollback");
await c.end();
