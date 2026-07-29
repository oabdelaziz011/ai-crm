import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const env = {};
for (const f of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const scheduling = await sb.from("scheduling_bookings").select("id,source,status,created_at").eq("company_id", COMPANY_ID).order("created_at", { ascending: false }).limit(5);
const legacy = await sb.from("bookings").select("id,status,booking_date,created_at").order("created_at", { ascending: false }).limit(5);
const audit = await sb.from("communication_audit_log").select("id,template_key,status,created_at").eq("company_id", COMPANY_ID).order("created_at", { ascending: false }).limit(5);

console.log(JSON.stringify({ scheduling: scheduling.data, schedulingError: scheduling.error?.message, legacy: legacy.data, legacyError: legacy.error?.message, audit: audit.data }, null, 2));
