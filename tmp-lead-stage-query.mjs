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
select
  l.id,
  l.stage_id,
  l.lifecycle_status,
  l.title,
  s.name as stage_name
from public.leads l
left join public.lead_stages s on s.id = l.stage_id
where l.id = '7910a2b8-ff3e-46ee-9137-04e636fc8dea'
`);
console.log(JSON.stringify(res.rows, null, 2));
await client.end();
