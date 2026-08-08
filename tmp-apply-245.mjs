import { createRequire } from "node:module";
import fs from "node:fs";
import { loadProjectEnv } from "./scripts/lib/load-project-env.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("./node_modules/.pnpm/drizzle-orm@0.45.2_@types+pg@8.20.0_pg@8.22.0/node_modules/pg");

const env = loadProjectEnv(process.cwd(), { hydrateProcessEnv: true });
const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const sql = fs.readFileSync(
  "supabase/migrations/245_lead_enterprise_data_contract_sprint_3_11_2.sql",
  "utf8",
);
await client.query(sql);

const cols = await client.query(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='leads'
   and column_name in ('expected_close_date','temperature','notes','tags','last_activity_at')
   order by 1`,
);
console.log("lead cols after migration", cols.rows.map((r) => r.column_name));

await client.end();
