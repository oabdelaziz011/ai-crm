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

const allUsersPerms = await client.query(
  `select id, code from public.permissions where code like 'users.%' order by code`,
);
console.log("all users.* permission codes", allUsersPerms.rows.map((r) => r.code));

const insertAll = await client.query(
  `insert into public.role_permissions (role_id, permission_id)
   select $1, p.id
   from public.permissions p
   where p.code like 'users.%'
   on conflict do nothing
   returning permission_id`,
  [roleId],
);
console.log("inserted users.% role_permissions rows", insertAll.rowCount);

const insertView = await client.query(
  `insert into public.role_permissions (role_id, permission_id)
   select $1, p.id
   from public.permissions p
   where p.code = 'users.view'
   on conflict do nothing
   returning permission_id`,
  [roleId],
);
console.log("users.view exists?", allUsersPerms.rows.some((r) => r.code === "users.view"));
console.log("inserted users.view rows", insertView.rowCount);

const after = await client.query(
  `select p.code from public.role_permissions rp
   join public.permissions p on p.id = rp.permission_id
   where rp.role_id = $1 and p.code like 'users.%'
   order by p.code`,
  [roleId],
);
console.log("resulting users.* permissions on DEMO Beta Admin:");
for (const row of after.rows) console.log(" ", row.code);

await client.end();
