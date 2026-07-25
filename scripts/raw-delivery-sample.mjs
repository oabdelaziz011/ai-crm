import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, payload, provider_response")
  .eq("company_channel_id", "e126113b-6d0e-48d3-9296-a46aafe0cc75")
  .gte("created_at", "2026-07-24T04:35:00Z")
  .lte("created_at", "2026-07-24T04:38:00Z")
  .limit(3);

console.log(JSON.stringify(data, null, 2));
