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

const roleId = "d0000030-0001-4001-8001-000000000002";

const current = await client.query(
  `select p.code from public.role_permissions rp
   join public.permissions p on p.id = rp.permission_id
   where rp.role_id = $1 and p.code like 'leads.%'
   order by p.code`,
  [roleId],
);
console.log("current leads perms on DEMO Beta Admin", current.rows.map((r) => r.code));

const leadPerms = await client.query(
  `select id, code from public.permissions where code like 'leads.%' order by code`,
);
console.log("all lead perm codes", leadPerms.rows.map((r) => r.code));

// Grant all leads.* to DEMO Beta Admin role
const insert = await client.query(
  `insert into public.role_permissions (role_id, permission_id)
   select $1, p.id
   from public.permissions p
   where p.code like 'leads.%'
   on conflict do nothing
   returning permission_id`,
  [roleId],
);
console.log("inserted role_permissions rows", insert.rowCount);

const after = await client.query(
  `select p.code from public.role_permissions rp
   join public.permissions p on p.id = rp.permission_id
   where rp.role_id = $1 and p.code like 'leads.%'
   order by p.code`,
  [roleId],
);
console.log("after leads perms", after.rows.map((r) => r.code));

await client.end();
