import { createRequire } from "node:module";
import { loadProjectEnv } from "./scripts/lib/load-project-env.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("./node_modules/.pnpm/drizzle-orm@0.45.2_@types+pg@8.20.0_pg@8.22.0/node_modules/pg");

const env = loadProjectEnv(process.cwd(), { hydrateProcessEnv: true });
const url = env.DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("NO_DATABASE_URL");
  process.exit(1);
}

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const perms = await client.query(
  `select code from public.permissions where code like 'leads.%' order by code`,
);
console.log("perms", perms.rows.map((r) => r.code));

const rolePerms = await client.query(
  `select r.name as role_name, p.code
   from public.role_permissions rp
   join public.roles r on r.id = rp.role_id
   join public.permissions p on p.id = rp.permission_id
   where p.code like 'leads.%'
   order by 1,2
   limit 80`,
);
console.log("role_perms count", rolePerms.rows.length);
console.log("role_perms", rolePerms.rows);

const companies = await client.query(
  `select id, name from public.companies
   where name ilike '%demo%' or name ilike '%beta%' or name ilike '%value%'
   limit 10`,
);
console.log("companies", companies.rows);

const cols = await client.query(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='leads'
   and column_name in ('expected_close_date','temperature','notes','tags','last_activity_at')
   order by 1`,
);
console.log("lead cols", cols.rows.map((r) => r.column_name));

const profiles = await client.query(
  `select id, user_id, full_name, email, company_id, role, is_super_admin
   from public.profiles
   where full_name ilike '%admin%' or full_name ilike '%demo%' or full_name ilike '%beta%'
   limit 20`,
);
console.log("profiles", profiles.rows);

await client.end();
