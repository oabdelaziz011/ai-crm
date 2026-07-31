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

// Search error messages across tables
const patterns = ["131005", "Access denied", "access denied", "WhatsApp API"];

console.log("=== channel_delivery_events errors ===");
const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, error_message, delivery_status, metadata")
  .eq("company_channel_id", CHANNEL_ID)
  .not("error_message", "is", null)
  .order("created_at", { ascending: false })
  .limit(20);
for (const row of deliveries ?? []) console.log(JSON.stringify(row));

console.log("\n=== channel_inbound_events errors ===");
const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, error_message, processing_status")
  .eq("company_channel_id", CHANNEL_ID)
  .not("error_message", "is", null)
  .order("created_at", { ascending: false })
  .limit(20);
for (const row of inbounds ?? []) console.log(JSON.stringify(row));

console.log("\n=== notification_queue whatsapp failures ===");
const { data: notifs } = await sb
  .from("notification_queue")
  .select("id, created_at, status, error_message, channel, metadata")
  .eq("channel", "whatsapp")
  .in("status", ["failed", "dead"])
  .order("created_at", { ascending: false })
  .limit(20);
for (const row of notifs ?? []) console.log(JSON.stringify(row));

console.log("\n=== automation_runs with error_message ===");
const { data: runs } = await sb
  .from("automation_runs")
  .select("id, created_at, error_message, status, variables")
  .not("error_message", "is", null)
  .order("created_at", { ascending: false })
  .limit(10);
for (const row of runs ?? []) {
  const err = row.error_message ?? "";
  if (patterns.some((p) => err.includes(p))) {
    console.log(JSON.stringify({ id: row.id, created_at: row.created_at, error: err.slice(0, 200), status: row.status }));
  }
}

console.log("\n=== Total delivery events ===");
const { count } = await sb
  .from("channel_delivery_events")
  .select("*", { count: "exact", head: true })
  .eq("company_channel_id", CHANNEL_ID);
console.log("count:", count);
