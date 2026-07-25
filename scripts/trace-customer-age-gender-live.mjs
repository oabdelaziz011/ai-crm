/**
 * Trace latest real WhatsApp execution: list gender → create customer → customers row.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const report = {
  generatedAt: new Date().toISOString(),
  flowId: FLOW_ID,
  steps: {},
};

async function main() {
  // Latest WhatsApp inbound message
  const { data: inboundMsgs } = await sb
    .from("conversation_messages")
    .select("id, conversation_id, message_type, content, metadata, created_at")
    .eq("message_type", "incoming")
    .order("created_at", { ascending: false })
    .limit(100);

  const whatsappInbounds = (inboundMsgs ?? []).filter((m) => {
    const meta = JSON.stringify(m.metadata ?? {});
    const content = JSON.stringify(m.content ?? {});
    return meta.includes("whatsapp") || meta.includes("interactive") || content.includes("interactive");
  });

  report.steps.latestInboundMessages = (inboundMsgs ?? []).slice(0, 5).map((m) => ({
    id: m.id,
    conversation_id: m.conversation_id,
    created_at: m.created_at,
    contentPreview: JSON.stringify(m.content).slice(0, 120),
  }));

  // Find conversation with WhatsApp channel
  const { data: conversations } = await sb
    .from("conversations")
    .select("id, conversation_number, channel_type, customer_id, company_id, external_thread_id, last_message_at, created_at")
    .eq("channel_type", "whatsapp")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(10);

  report.steps.latestWhatsAppConversations = conversations;

  const latestConv = conversations?.[0] ?? null;
  report.steps.selectedConversation = latestConv;

  // Latest automation runs for flow (WhatsApp channel via session)
  const { data: runs } = await sb
    .from("automation_runs")
    .select("*")
    .eq("flow_id", FLOW_ID)
    .order("started_at", { ascending: false })
    .limit(15);

  report.steps.latestFlowRuns = (runs ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    flow_version_id: r.flow_version_id,
    current_node_id: r.current_node_id,
    started_at: r.started_at,
    finished_at: r.finished_at,
    error_message: r.error_message,
    variableKeys: Object.keys(r.variables ?? {}).sort(),
    customer_gender: r.variables?.customer_gender,
    customer_age: r.variables?.customer_age,
    customer_name: r.variables?.customer_name,
    customer_phone: r.variables?.customer_phone,
    customer: r.variables?.customer,
    conversation: r.variables?.conversation,
  }));

  // Prefer completed run with create customer in variables.customer
  const runWithCustomer =
    (runs ?? []).find((r) => r.variables?.customer?.id && r.status === "completed") ??
    (runs ?? []).find((r) => r.variables?.customer?.exists === true) ??
    runs?.[0] ??
    null;

  report.steps.selectedRun = runWithCustomer
    ? {
        id: runWithCustomer.id,
        status: runWithCustomer.status,
        flow_version_id: runWithCustomer.flow_version_id,
        started_at: runWithCustomer.started_at,
        finished_at: runWithCustomer.finished_at,
      }
    : null;

  if (runWithCustomer) {
    const vars = runWithCustomer.variables ?? {};
    report.steps.runVariablesFull = vars;
    report.steps.runVariablesBeforeCreateCustomer = {
      customer_gender: vars.customer_gender ?? null,
      customer_age: vars.customer_age ?? null,
      customer_name: vars.customer_name ?? null,
      customer_phone: vars.customer_phone ?? null,
      allTopLevelKeys: Object.keys(vars).filter((k) => !k.startsWith("__")).sort(),
    };

    const { data: session } = await sb
      .from("conversation_sessions")
      .select("*")
      .eq("run_id", runWithCustomer.id)
      .maybeSingle();

    report.steps.session = session
      ? {
          id: session.id,
          status: session.status,
          variables: session.variables,
          customer_gender: session.variables?.customer_gender,
          customer_age: session.variables?.customer_age,
        }
      : null;
  }

  // Active / run version graph nodes
  const versionId = runWithCustomer?.flow_version_id ?? null;
  let versionNodes = [];
  if (versionId) {
    const { data: nodes } = await sb
      .from("automation_flow_version_nodes")
      .select("id, type, label, config")
      .eq("flow_version_id", versionId);
    versionNodes = nodes ?? [];
  } else {
    const { data: flow } = await sb.from("automation_flows").select("active_version_id").eq("id", FLOW_ID).single();
    const { data: nodes } = await sb
      .from("automation_flow_version_nodes")
      .select("id, type, label, config")
      .eq("flow_version_id", flow?.active_version_id);
    versionNodes = nodes ?? [];
    report.steps.activeVersionId = flow?.active_version_id;
  }

  const listNodes = versionNodes.filter(
    (n) => n.config?.action === "send_list" || n.config?.builderType === "list",
  );
  const createCustomerNodes = versionNodes.filter((n) => n.config?.action === "create_customer");

  report.steps.listNodes = listNodes.map((n) => ({
    id: n.id,
    label: n.label,
    inputKey: n.config?.inputKey ?? null,
    saveAs: n.config?.saveAs ?? null,
    title: n.config?.title,
    rows: n.config?.sections?.[0]?.rows ?? n.config?.rows ?? null,
  }));

  report.steps.createCustomerNodes = createCustomerNodes.map((n) => ({
    id: n.id,
    label: n.label,
    nameField: n.config?.nameField ?? null,
    phoneField: n.config?.phoneField ?? null,
    emailField: n.config?.emailField ?? null,
    ageField: n.config?.ageField ?? null,
    genderField: n.config?.genderField ?? null,
    fullConfig: n.config,
  }));

  // Customer row from run variables or conversation
  const customerId =
    runWithCustomer?.variables?.customer?.id ??
    latestConv?.customer_id ??
    null;

  if (customerId) {
    const { data: customer } = await sb.from("customers").select("*").eq("id", customerId).maybeSingle();
    report.steps.customerRow = customer;

    const { data: auditLogs } = await sb
      .from("audit_logs")
      .select("*")
      .eq("entity", "customers")
      .eq("entity_id", customerId)
      .order("created_at", { ascending: false })
      .limit(3);
    report.steps.customerAuditLogs = auditLogs;
  }

  // Latest customers created (recent)
  const { data: recentCustomers } = await sb
    .from("customers")
    .select("id, name, phone, age, gender, email, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(5);
  report.steps.recentCustomers = recentCustomers;

  // Check if age/gender columns exist
  const { data: sampleCustomer, error: colErr } = await sb
    .from("customers")
    .select("age, gender")
    .limit(1);
  report.steps.ageGenderColumnsExist = !colErr;
  report.steps.ageGenderColumnError = colErr?.message ?? null;

  // Find run that reached create customer - look for customer entity in vars after create
  for (const r of runs ?? []) {
    const c = r.variables?.customer;
    if (c?.id && c?.name) {
      report.steps.runThatCreatedCustomer = {
        runId: r.id,
        started_at: r.started_at,
        customer_gender_in_vars: r.variables?.customer_gender,
        customer_age_in_vars: r.variables?.customer_age,
        customer_entity_gender: c.gender,
        customer_entity_age: c.age,
        createCustomerNodeIds: createCustomerNodes.map((n) => n.id),
      };
      break;
    }
  }

  // Interactive list reply messages for latest conversation
  if (latestConv) {
    const { data: msgs } = await sb
      .from("conversation_messages")
      .select("id, message_type, content, metadata, created_at")
      .eq("conversation_id", latestConv.id)
      .order("created_at", { ascending: false })
      .limit(30);
    report.steps.latestConversationMessages = (msgs ?? []).map((m) => ({
      id: m.id,
      message_type: m.message_type,
      created_at: m.created_at,
      content: m.content,
      metadata: m.metadata,
    }));
  }

  mkdirSync(resolve(root, "docs/architecture"), { recursive: true });
  const outPath = resolve(root, "docs/architecture/customer-age-gender-live-trace.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error("\nWrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
