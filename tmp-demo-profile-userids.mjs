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

const listed = await client.query(
  `select id, user_id, full_name, email
   from public.profiles
   where company_id = $1
   order by full_name nulls last, email nulls last`,
  [companyId],
);
console.log("=== 1. Profiles for company ===");
console.log(JSON.stringify(listed.rows, null, 2));

const updated = await client.query(
  `update public.profiles
   set user_id = id
   where company_id = $1
     and user_id is null
     and full_name in ('DEMO Finance Manager', 'DEMO Employee')
   returning id, user_id, full_name, email`,
  [companyId],
);
console.log("=== 2. Updated (null user_id -> id) ===");
console.log(JSON.stringify(updated.rows, null, 2));
console.log("updated rowCount:", updated.rowCount);

const finalRows = await client.query(
  `select id, user_id, full_name, email
   from public.profiles
   where company_id = $1
     and user_id is not null
   order by full_name nulls last, email nulls last`,
  [companyId],
);
console.log("=== 3. Final profiles with non-null user_id ===");
console.log(JSON.stringify(finalRows.rows, null, 2));

await client.end();
