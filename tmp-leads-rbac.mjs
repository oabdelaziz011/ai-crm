import { createRequire } from "node:module";
import { loadProjectEnv } from "./scripts/lib/load-project-env.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("./node_modules/.pnpm/drizzle-orm@0.45.2_@types+pg@8.20.0_pg@8.22.0/node_modules/pg");

const env = loadProjectEnv(process.cwd(), { hydrateProcessEnv: true });
const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const companyId = "d0000010-0001-4001-8001-000000000002";
const userId = "d0000002-0001-4001-8001-000000000002";

const userRoles = await client.query(
  `select ur.*, r.name, r.company_id
   from public.user_roles ur
   join public.roles r on r.id = ur.role_id
   where ur.user_id = $1`,
  [userId],
);
console.log("user_roles", userRoles.rows);

const companyRoles = await client.query(
  `select id, name, is_system from public.roles where company_id = $1 order by name`,
  [companyId],
);
console.log("company_roles", companyRoles.rows);

const missingCore = await client.query(
  `select r.id, r.name, p.code
   from public.roles r
   cross join public.permissions p
   left join public.role_permissions rp on rp.role_id = r.id and rp.permission_id = p.id
   where r.company_id = $1
     and r.name in ('Admin', 'Company Admin', 'Manager', 'Employee')
     and p.code in ('leads.view','leads.create','leads.edit','leads.assign','leads.convert','leads.archive','leads.manage','leads.qualify')
     and rp.permission_id is null
   order by r.name, p.code`,
  [companyId],
);
console.log("missing core leads perms for beta roles", missingCore.rows);

const userDirect = await client.query(
  `select p.code from public.user_permissions up
   join public.permissions p on p.id = up.permission_id
   where up.user_id = $1 and p.code like 'leads.%'`,
  [userId],
);
console.log("user direct leads perms", userDirect.rows);

await client.end();
