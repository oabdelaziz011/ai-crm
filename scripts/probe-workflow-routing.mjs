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
const flowId = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";

const binding = await sb.from("company_channel_automation_bindings").select("*").eq("company_channel_id", channelId).is("deleted_at", null).maybeSingle();
const flow = await sb.from("automation_flows").select("id,name,status,company_id,deleted_at").eq("id", flowId).maybeSingle();
const channel = await sb.from("company_channels").select("id,display_name,configuration,status,is_enabled,company_id").eq("id", channelId).maybeSingle();

// Simulate ChannelWorkflowResolver.resolve()
const resolved = binding.data && binding.data.is_enabled
  ? { binding: binding.data, flowCheck: null }
  : { binding: binding.data, resolverResult: null, reason: !binding.data ? "no_binding" : "is_enabled_false" };

if (binding.data?.is_enabled && flow.data) {
  const executable = flow.data.company_id === channel.data?.company_id && flow.data.status === "active" && !flow.data.deleted_at;
  resolved.resolverResult = executable
    ? { automationFlowId: flowId }
    : null;
  resolved.reason = executable ? "would_route_to_workflow" : `flow_not_executable status=${flow.data.status}`;
}

console.log(JSON.stringify({ channel: channel.data, binding: binding.data, flow: flow.data, routing: resolved }, null, 2));
