import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const parsed = new URL(env.DATABASE_URL.replace(/^postgresql:/, "postgres:"));
const password = parsed.password;
const projectRef = "lfbtnskmvibikalsxwsm";
const region = "eu-north-1";

const urls = [
  `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
];

for (const url of urls) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const r = await client.query("select 1 as ok");
    console.log("connected", url.includes(":5432") ? "session" : "transaction", r.rows);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.error("failed", url.slice(0, 80), e.message);
  }
}
process.exit(1);
