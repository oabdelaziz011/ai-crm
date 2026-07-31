import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveChannelId,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const CHANNEL_ID = resolveChannelId(argv, env);
const sb = createServiceRoleSupabaseClient(env, createClient);

const { data: byStatus } = await sb
  .from("channel_delivery_events")
  .select("delivery_status")
  .eq("company_channel_id", CHANNEL_ID);

const statusCounts = {};
for (const row of byStatus ?? []) {
  statusCounts[row.delivery_status] = (statusCounts[row.delivery_status] ?? 0) + 1;
}
console.log("delivery status counts:", statusCounts);

const { data: failed } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, delivery_status, error_message, metadata, payload")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("delivery_status", "failed")
  .order("created_at", { ascending: false })
  .limit(20);

console.log("\n=== FAILED deliveries ===");
for (const row of failed ?? []) {
  console.log(JSON.stringify({
    id: row.id,
    created_at: row.created_at,
    error: row.error_message,
    meta: row.metadata,
  }));
}

// Search metadata/provider response for 131005
const { data: allRecent } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, delivery_status, error_message, metadata")
  .eq("company_channel_id", CHANNEL_ID)
  .order("created_at", { ascending: false })
  .limit(50);

console.log("\n=== Scan recent 50 for 131005 in metadata/error ===");
for (const row of allRecent ?? []) {
  const blob = JSON.stringify(row);
  if (blob.includes("131005") || blob.toLowerCase().includes("access denied")) {
    console.log(blob);
  }
}

console.log("\n=== Latest 5 deliveries ===");
for (const row of (allRecent ?? []).slice(0, 5)) {
  console.log(JSON.stringify(row));
}

// Check channel config history - updated_at
const { data: ch } = await sb.from("company_channels").select("updated_at, configuration").eq("id", CHANNEL_ID).single();
console.log("\n=== Channel updated_at ===", ch?.updated_at);
console.log("phoneNumberId:", ch?.configuration?.phoneNumberId);
