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
const ch = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

const { data, error, count } = await sb
  .from("channel_delivery_events")
  .select("id,created_at,metadata,delivery_status", { count: "exact" })
  .eq("company_channel_id", ch)
  .gte("created_at", "2026-07-24T04:00:00Z")
  .lte("created_at", "2026-07-24T05:30:00Z")
  .order("created_at", { ascending: true })
  .limit(50);

console.log("error", error?.message);
console.log("count", count, "returned", data?.length);
for (const d of data ?? []) {
  console.log(JSON.stringify({ at: d.created_at, status: d.delivery_status, meta: d.metadata }));
}

// Any delivery ever for channel
const { count: total } = await sb
  .from("channel_delivery_events")
  .select("*", { count: "exact", head: true })
  .eq("company_channel_id", ch);
console.log("total deliveries for channel", total);
