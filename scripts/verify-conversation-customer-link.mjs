/**
 * Backfill + verify conversation.customer_id for latest real WhatsApp create-customer run.
 * Uses the same link port the webhook will call after deploy.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createSupabaseConversationCustomerLinkPort } from "../lib/automation-platform/src/crm/supabase/create-supabase-conversation-customer-link-port.ts";
import { resolveInboxConversationId } from "../lib/automation-platform/src/runtime/resolve-inbox-conversation-id.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";

const env = {};
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = env[m[1]] ?? m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const linkPort = createSupabaseConversationCustomerLinkPort(sb);

const { data: run } = await sb
  .from("automation_runs")
  .select("*")
  .eq("flow_id", FLOW_ID)
  .order("started_at", { ascending: false })
  .limit(20)
  .then(({ data }) => ({ data: (data ?? []).find((r) => r.variables?.customer?.id) ?? null }));

if (!run) throw new Error("No recent run with created customer");

const vars = run.variables ?? {};
const conversationId = resolveInboxConversationId(vars);
const customerId = vars.customer?.id;
const companyId = run.company_id;

const before = conversationId
  ? await sb.from("conversations").select("id, customer_id, conversation_number").eq("id", conversationId).single()
  : { data: null };

if (conversationId && customerId) {
  await linkPort.linkCustomerToConversation({
    companyId,
    conversationId,
    customerId,
    automationSessionId: run.session_id,
  });
}

const after = conversationId
  ? await sb.from("conversations").select("id, customer_id, conversation_number").eq("id", conversationId).single()
  : { data: null };

const report = {
  runId: run.id,
  started_at: run.started_at,
  conversationId,
  customerId,
  before: before.data,
  after: after.data,
  linked: after.data?.customer_id === customerId,
};

mkdirSync(resolve(root, "docs/architecture"), { recursive: true });
writeFileSync(resolve(root, "docs/architecture/conversation-customer-link-verify.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!report.linked) process.exit(1);
