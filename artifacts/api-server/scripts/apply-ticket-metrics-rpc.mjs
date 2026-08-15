import { createRequire } from "module";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");
config({ path: resolve(projectRoot, ".env") });

const require = createRequire(resolve(projectRoot, "package.json"));
const pg = require("pg");

const sql = readFileSync(
  resolve(projectRoot, "supabase/migrations/259_ticket_inbox_metrics_kpis.sql"),
  "utf8",
);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query(sql);
const { rows } = await client.query(
  "select public.ticket_platform_company_metrics_v1($1::uuid, now()) as m",
  ["2d27f7fb-c15e-4d60-84e9-1793f36f2172"],
);
console.log(JSON.stringify(rows[0].m, null, 2));
await client.end();
