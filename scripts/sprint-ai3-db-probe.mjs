import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
const channelId = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

const binding = await sb.from("company_channel_automation_bindings").select("*").eq("company_channel_id", channelId).is("deleted_at", null).maybeSingle();
const channel = await sb.from("company_channels").select("id, company_id, status").eq("id", channelId).maybeSingle();
const companyId = channel.data?.company_id;
const tools = await sb.from("tool_definitions").select("key,is_enabled").in("key", ["search_availability", "create_booking", "booking", "appointment_lookup"]);
const execs = await sb.from("tool_executions").select("tool_key,status,triggered_by,created_at,company_id").order("created_at", { ascending: false }).limit(20);
const execCount = await sb.from("tool_executions").select("id", { count: "exact", head: true });
const execError = execs.error?.message;
const profiles = companyId
  ? await sb.from("profiles").select("id,user_id,company_id,is_active").eq("company_id", companyId).eq("is_active", true).limit(3)
  : { data: null };
const services = companyId
  ? await sb.from("scheduling_services").select("id,name,status").eq("company_id", companyId).is("deleted_at", null).limit(10)
  : { data: null };
const run = await sb.from("automation_runs").select("id,status,flow_id,started_at").eq("id", "bdc6e65c-d76b-470b-8638-ed7f52974647").maybeSingle();

console.log(JSON.stringify({
  binding: binding.data,
  bindingError: binding.error?.message,
  channel: channel.data,
  tools: tools.data,
  recentToolExecs: execs.data,
  execCount: execCount.count,
  execSelectError: execError,
  execCountError: execCount.error?.message,
  profiles: profiles.data,
  services: services.data,
  automationRun: run.data,
}, null, 2));
