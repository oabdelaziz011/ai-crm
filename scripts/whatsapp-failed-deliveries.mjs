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

const { data: failed, error } = await sb
  .from("channel_delivery_events")
  .select("*")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("delivery_status", "failed")
  .order("created_at", { ascending: false })
  .limit(10);

console.log("query error:", error?.message ?? null);
console.log("failed count returned:", failed?.length ?? 0);

for (const row of failed ?? []) {
  console.log(JSON.stringify({
    id: row.id,
    created_at: row.created_at,
    error_message: row.error_message,
    metadata: row.metadata,
    payload: row.payload,
    provider_response: row.provider_response,
  }, null, 2));
}

// Group error messages
const { data: allFailed } = await sb
  .from("channel_delivery_events")
  .select("error_message, metadata, created_at")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("delivery_status", "failed");

const errorCounts = {};
for (const row of allFailed ?? []) {
  const key = row.error_message ?? "(null)";
  errorCounts[key] = (errorCounts[key] ?? 0) + 1;
}
console.log("\n=== Error message histogram ===");
console.log(JSON.stringify(errorCounts, null, 2));
