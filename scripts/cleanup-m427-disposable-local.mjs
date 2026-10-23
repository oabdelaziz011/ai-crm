/**
 * Idempotent Local-only cleanup for disposable Quote Delivery E2E fixtures
 * prefixed with m427_ (companies, users, quotes, roles, overrides).
 *
 * Does NOT disable triggers, TRUNCATE, or db reset.
 * Deletes only rows scoped to m427_* test prefixes — not general audit/notifications.
 *
 * Run:
 *   node scripts/cleanup-m427-disposable-local.mjs
 *   node scripts/cleanup-m427-disposable-local.mjs --prefix m427_
 */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromApi = createRequire(resolve(__dirname, "../artifacts/api-server/package.json"));
const requireFromDb = createRequire(resolve(__dirname, "../lib/db/package.json"));
const { createClient } = requireFromApi("@supabase/supabase-js");
const pg = requireFromDb("pg");

const prefixArgIdx = process.argv.indexOf("--prefix");
const PREFIX = prefixArgIdx >= 0 ? String(process.argv[prefixArgIdx + 1] || "").trim() : "m427_";
if (!PREFIX || PREFIX.length < 4 || !/^m427[_a-z0-9]*$/i.test(PREFIX)) {
  throw new Error(`Refusing unsafe prefix: ${PREFIX}`);
}
const like = `${PREFIX}%`;

const root = resolveProjectRoot(import.meta.url);
process.env.VALUEOR_ENV = "local";
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const databaseUrl = (env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres").trim();
const supabaseUrl = (env.SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "";

if (isProductionDatabaseUrl(databaseUrl)) {
  throw new Error("Refusing cleanup against production DATABASE_URL.");
}
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost):54321$/i.test(supabaseUrl)) {
  throw new Error(`Refusing non-local SUPABASE_URL: ${supabaseUrl}`);
}
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const counts = {};
async function del(label, sql, params) {
  const res = await c.query(sql, params);
  counts[label] = (counts[label] ?? 0) + (res.rowCount ?? 0);
  return res;
}

const companies = (
  await c.query(`select id, name from public.companies where name like $1`, [like])
).rows;
const users = (
  await c.query(`select id, email from auth.users where email like $1`, [like])
).rows;
const companyIds = companies.map((r) => r.id);
const userIds = users.map((r) => r.id);

console.log(
  JSON.stringify(
    {
      mode: "local_m427_cleanup",
      prefix: PREFIX,
      matchedCompanies: companies.map((r) => r.name),
      matchedUsers: users.map((r) => r.email),
    },
    null,
    2,
  ),
);

if (userIds.length) {
  await del(
    "notifications",
    `delete from public.notifications where user_id = any($1::uuid[])`,
    [userIds],
  );
  await del(`user_roles`, `delete from public.user_roles where user_id = any($1::uuid[])`, [
    userIds,
  ]);
}

if (companyIds.length) {
  await del(
    "audit_logs_company_scoped",
    `delete from public.audit_logs where company_id = any($1::uuid[])`,
    [companyIds],
  ).catch(async (err) => {
    counts.audit_logs_company_scoped_error = err.message;
  });
  await del(
    "quote_send_attempts",
    `delete from public.quote_send_attempts where company_id = any($1::uuid[])`,
    [companyIds],
  ).catch(() => {
    counts.quote_send_attempts = counts.quote_send_attempts ?? 0;
  });
  await del(
    "quote_line_items",
    `delete from public.quote_line_items where company_id = any($1::uuid[])`,
    [companyIds],
  );
  await del(
    "quote_history",
    `delete from public.quote_history where company_id = any($1::uuid[])`,
    [companyIds],
  ).catch(() => {
    counts.quote_history = counts.quote_history ?? 0;
  });
  await del(
    "quote_approvals",
    `delete from public.quote_approvals where company_id = any($1::uuid[])`,
    [companyIds],
  ).catch(() => {
    counts.quote_approvals = counts.quote_approvals ?? 0;
  });
  await del(`quotes`, `delete from public.quotes where company_id = any($1::uuid[])`, [
    companyIds,
  ]);
  await del(
    "quote_templates",
    `delete from public.quote_templates where company_id = any($1::uuid[])`,
    [companyIds],
  ).catch(() => {
    counts.quote_templates = counts.quote_templates ?? 0;
  });
  await del(
    "company_feature_overrides",
    `delete from public.company_feature_overrides where company_id = any($1::uuid[])`,
    [companyIds],
  );
}

const roles = (
  await c.query(`select id from public.roles where name like $1`, [like])
).rows;
if (roles.length) {
  const roleIds = roles.map((r) => r.id);
  await del(
    "role_permissions",
    `delete from public.role_permissions where role_id = any($1::uuid[])`,
    [roleIds],
  );
  await del(`roles`, `delete from public.roles where id = any($1::uuid[])`, [roleIds]);
}

if (userIds.length) {
  // Remove profiles before auth.users so userDeleted notification trigger
  // cannot insert a notification for a missing auth user.
  await del(`profiles`, `delete from public.profiles where id = any($1::uuid[])`, [userIds]);
  let authDeleted = 0;
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) authDeleted += 1;
    else {
      const fallback = await c
        .query(`delete from auth.users where id = $1`, [id])
        .catch(() => ({ rowCount: 0 }));
      authDeleted += fallback.rowCount ?? 0;
    }
  }
  counts.auth_users = authDeleted;
}

if (companyIds.length) {
  await del(
    "companies",
    `delete from public.companies where id = any($1::uuid[]) and name like $2`,
    [companyIds, like],
  );
}

// Residual safety pass (idempotent)
await del(
  "companies_residual",
  `delete from public.companies where name like $1`,
  [like],
).catch(() => {});
await del(`auth_users_residual`, `delete from auth.users where email like $1`, [like]).catch(
  () => {},
);

const remainingCompanies = (
  await c.query(`select count(*)::int as n from public.companies where name like $1`, [like])
).rows[0].n;
const remainingUsers = (
  await c.query(`select count(*)::int as n from auth.users where email like $1`, [like])
).rows[0].n;

console.log(
  JSON.stringify(
    {
      deletedCounts: counts,
      remaining: { companies: remainingCompanies, users: remainingUsers },
      ok: remainingCompanies === 0 && remainingUsers === 0,
    },
    null,
    2,
  ),
);

await c.end();
process.exit(remainingCompanies === 0 && remainingUsers === 0 ? 0 : 1);
