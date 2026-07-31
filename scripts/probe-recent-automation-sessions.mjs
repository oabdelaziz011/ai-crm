#!/usr/bin/env node
/**
 * List recent automation sessions/runs for configured WhatsApp external user ids.
 *
 * Env:
 *   WHATSAPP_EXTERNAL_USER_IDS — comma-separated external user ids
 *   AUTOMATION_SESSIONS_SINCE — ISO timestamp filter (optional)
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  requireEnvValue,
  resolveCommaSeparatedEnv,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const users = resolveCommaSeparatedEnv(
  env,
  ["WHATSAPP_EXTERNAL_USER_IDS", "WHATSAPP_TEST_USER_IDS"],
  "WhatsApp external user ids (comma-separated)",
);
const since =
  env.AUTOMATION_SESSIONS_SINCE ??
  process.env.AUTOMATION_SESSIONS_SINCE ??
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const sb = createServiceRoleSupabaseClient(env, createClient);

for (const user of users) {
  const { data } = await sb
    .from("conversation_sessions")
    .select("id, status, last_activity_at, current_node_id, variables, run_id")
    .eq("channel", "whatsapp")
    .eq("external_user_id", user)
    .gte("last_activity_at", since)
    .order("last_activity_at", { ascending: false });
  console.log(`\n=== ${user} sessions since ${since} ===`);
  console.log(JSON.stringify(data, null, 2));

  const { data: runs } = await sb
    .from("automation_runs")
    .select("id, status, session_id, current_node_id, variables, started_at")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(15);
  const linked = (runs ?? []).filter((r) => data?.some((s) => s.id === r.session_id));
  console.log("linked runs:", JSON.stringify(linked, null, 2));
}
