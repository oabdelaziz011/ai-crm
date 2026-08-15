import { createRequire } from "node:module";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("../artifacts/login-app/node_modules/@supabase/supabase-js");

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const userId = "827d94d5-f211-4627-8424-045a86656555";
const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
console.log("profile", profile);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query("begin");
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);
  await client.query(`set local role authenticated`);
  const result = await client.query(
    `select public.onboard_own_company_v1($1::jsonb) as result`,
    [
      JSON.stringify({
        name: "SQL Onboard Test",
        legal_name: "SQL Onboard Legal",
        business_type: "clinic",
        industry: "healthcare",
        contact_email: "sql-onboard@valueor.test",
        contact_phone: "+966500000099",
        country: "SA",
        city: "Riyadh",
        timezone: "Asia/Riyadh",
        currency: "SAR",
        owner_display_name: "SQL Tester",
        owner_job_title: "Owner",
      }),
    ],
  );
  console.log("result", result.rows[0]);
  await client.query("rollback");
} catch (error) {
  console.error("SQL FAIL", error.message);
  await client.query("rollback").catch(() => {});
} finally {
  await client.end();
}
