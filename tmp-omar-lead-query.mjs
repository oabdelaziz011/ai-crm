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
const res = await client.query(`
select id, title, company_name, assigned_user_id, estimated_value, priority, temperature, source_id, expected_close_date, notes, tags, stage_id
from public.leads
where company_id = 'd0000010-0001-4001-8001-000000000002'
and title = 'Omar Abdelaziz'
order by created_at desc
limit 3
`);
console.log(JSON.stringify(res.rows, null, 2));
await client.end();
