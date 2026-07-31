/**
 * Step-by-step Book Appointment trace with variables after each node.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveArgOrEnv,
} from "./lib/dev-script-env.mjs";

const { root, env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const FLOW_ID = resolveArgOrEnv(argv, 0, ["FLOW_ID", "AUTOMATION_FLOW_ID"], env, "automation flow id");
const COMPANY_ID = resolveArgOrEnv(argv, 1, ["COMPANY_ID", "VERIFY_COMPANY_ID"], env, "company id");
const RUN_ID = resolveArgOrEnv(argv, 2, ["RUN_ID", "AUTOMATION_RUN_ID"], env, "automation run id");
const sb = createServiceRoleSupabaseClient(env, createClient);

function parseCfg(n) {
  return typeof n?.config === "string" ? JSON.parse(n.config) : n?.config ?? {};
}

function nodeDesc(n) {
  if (!n) return null;
  const c = parseCfg(n);
  return {
    id: n.id,
    label: n.label,
    type: n.type,
    action: c.action,
    builderType: c.builderType,
    inputKey: c.inputKey,
    prompt: c.prompt ?? c.text ?? c.message,
    lookupBy: c.lookupBy,
    valueBinding: c.value?.variable,
    lookup: c.lookup,
    mode: c.mode,
    ruleSet: c.ruleSet,
    switchField: c.field,
    cases: c.cases,
    title: c.title,
  };
}

const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
if (!run) throw new Error("Run not found: " + RUN_ID);

const VERSION = run.flow_version_id;
const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", VERSION);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", VERSION);
const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

// Find trigger and walk to send_buttons
const trigger = (nodes ?? []).find((n) => n.type === "trigger");
const sendButtons = (nodes ?? []).find((n) => parseCfg(n).action === "send_buttons");
const switchNode = (nodes ?? []).find((n) => n.type === "condition" && parseCfg(n).mode === "switch");

// Build adjacency
const outEdges = {};
for (const e of edges ?? []) {
  (outEdges[e.source_node_id] ??= []).push(e);
}

function walkFrom(start, stopIds = new Set()) {
  const order = [];
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    if (stopIds.has(id)) continue;
    for (const e of outEdges[id] ?? []) queue.push(e.target_node_id);
  }
  return order.map((id) => nodeById[id]).filter(Boolean);
}

// Book branch nodes in order
const bookEdge = (outEdges[switchNode?.id] ?? []).find((e) => e.condition?.case === "book");
const bookNodes = walkFrom(bookEdge?.target_node_id);

// Full path: trigger -> ... -> send_buttons -> switch -> book branch
const preSwitch = walkFrom(trigger?.id, new Set([switchNode?.id]));
const bookPathIds = [trigger?.id, ...preSwitch.map((n) => n.id), switchNode?.id, ...bookNodes.map((n) => n.id)].filter(Boolean);

// Delivery events for outbound reconstruction
const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("*")
  .contains("payload", { metadata: { automationRunId: RUN_ID } })
  .order("created_at", { ascending: true });

// Conversation messages
let convMessages = [];
if (run.variables?.conversationId) {
  const { data } = await sb
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", run.variables.conversationId)
    .order("created_at", { ascending: true });
  convMessages = data ?? [];
}

// Reconstruct step-by-step from run variables + graph knowledge
const phone = run.variables?.customer_phone ?? env.SAMPLE_CUSTOMER_PHONE ?? process.env.SAMPLE_CUSTOMER_PHONE ?? null;
if (!phone) {
  console.error("Run has no customer_phone and SAMPLE_CUSTOMER_PHONE is not set");
  process.exit(1);
}
const { count, data: custRecord } = await sb
  .from("customers")
  .select("id, name, phone, email, age, gender, created_at, updated_at")
  .eq("company_id", COMPANY_ID)
  .eq("phone", phone);

const customerCount = count ?? (custRecord?.length ?? 0);
const customer = Array.isArray(custRecord) ? custRecord[0] : custRecord;

const steps = [];

// Step 0: Initial kickoff (inferred from run start state)
steps.push({
  step: 1,
  phase: "kickoff",
  node: nodeDesc(trigger),
  action: "Flow triggered by inbound WhatsApp message",
  conditionResult: null,
  variablesAfter: {
    conversationId: run.variables?.conversationId,
    channelSessionId: run.variables?.channelSessionId,
    companyChannelId: run.variables?.companyChannelId,
    phoneNumberId: run.variables?.phoneNumberId,
    senderName: run.variables?.senderName,
    lastMessage: run.variables?.lastMessage ?? "hi",
    whatsappMessageType: run.variables?.whatsappMessageType ?? "text",
  },
});

// Welcome + buttons nodes (from graph)
for (const n of preSwitch.filter((n) => n.id !== trigger?.id)) {
  const c = parseCfg(n);
  const patch = {};
  if (c.action === "send_message" || c.action === "send_text") {
    patch.__prompt = c.message ?? c.text;
    patch.__outboundQueue = [{ kind: "text", text: c.message ?? c.text }];
  }
  if (c.action === "send_buttons") {
    patch.__prompt = c.text;
    patch.__waitingFor = "interactive_selection";
    patch.__outboundQueue = [{ kind: "buttons", text: c.text, buttons: c.buttons }];
    patch.conversation = { last_selection_type: null };
  }
  steps.push({
    step: steps.length + 1,
    phase: "automated",
    node: nodeDesc(n),
    action: `Execute ${c.action}`,
    conditionResult: null,
    variablesAfter: { ...steps[steps.length - 1].variablesAfter, ...patch },
  });
}

// Button reply resume -> switch
const varsBeforeSwitch = steps[steps.length - 1]?.variablesAfter ?? {};
steps.push({
  step: steps.length + 1,
  phase: "resume (button_reply)",
  node: nodeDesc(sendButtons),
  action: "Resume: user pressed Book Appointment (replyId=book)",
  inbound: { replyId: "book", title: "Book Appointment", type: "button_reply" },
  conditionResult: null,
  variablesAfter: {
    ...varsBeforeSwitch,
    interactive_selection: "book",
    __waitingFor: null,
    conversation: {
      last_message: "Book Appointment",
      last_button_id: "book",
      last_button_title: "Book Appointment",
      last_selection_type: "button",
    },
  },
});

steps.push({
  step: steps.length + 1,
  phase: "automated",
  node: nodeDesc(switchNode),
  action: `Switch on conversation.last_button_id`,
  conditionEvaluated: `conversation.last_button_id == "book"`,
  conditionResult: true,
  branchTaken: "book",
  variablesAfter: {
    ...steps[steps.length - 1].variablesAfter,
    __switchCase: "book",
  },
});

// Ask phone
const askPhoneNode = bookNodes.find((n) => parseCfg(n).inputKey === "customer_phone");
steps.push({
  step: steps.length + 1,
  phase: "automated",
  node: nodeDesc(askPhoneNode),
  action: "Send prompt and wait for customer_phone",
  conditionResult: null,
  variablesAfter: {
    ...steps[steps.length - 1].variablesAfter,
    __prompt: "what is your phone number?",
    __waitingFor: "customer_phone",
    __outbound: null,
    __outboundQueue: [],
  },
});

// Phone text resume
steps.push({
  step: steps.length + 1,
  phase: "resume (text)",
  node: nodeDesc(askPhoneNode),
  action: "Resume: user entered phone number",
  inbound: { text: phone, type: "text" },
  extractedValue: phone,
  conditionResult: null,
  variablesAfter: {
    ...steps[steps.length - 1].variablesAfter,
    customer_phone: phone,
    __waitingFor: null,
    whatsappMessageType: "text",
  },
});

// find_customer
const findNode = bookNodes.find((n) => parseCfg(n).action === "find_customer");
const lookupStatus = run.variables?.lookup?.status ?? (customer ? "found" : "not_found");
const lookupCount = run.variables?.lookup?.count ?? customerCount;

steps.push({
  step: steps.length + 1,
  phase: "automated",
  node: nodeDesc(findNode),
  action: "find_customer lookupBy=phone",
  binding: "{{customer_phone}}",
  resolvedLookupValue: phone,
  databaseQuery: {
    table: "customers",
    filters: { company_id: COMPANY_ID, phone },
    sqlEquivalent: `SELECT id, name, email, phone, age, gender, notes, created_at, updated_at FROM customers WHERE company_id = '${COMPANY_ID}' AND phone = '${phone}' LIMIT 1`,
    countQuery: `SELECT count(*) FROM customers WHERE company_id = '${COMPANY_ID}' AND phone = '${phone}'`,
  },
  customerFound: lookupStatus === "found",
  customerRecord: customer ?? null,
  conditionResult: null,
  variablesAfter: {
    ...steps[steps.length - 1].variablesAfter,
    lookup: { status: lookupStatus, count: lookupCount },
    customer: run.variables?.customer ?? (customer ? {
      exists: true,
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      age: customer.age,
      gender: customer.gender,
    } : { exists: false }),
  },
});

// IF node
const ifNode = bookNodes.find((n) => n.type === "condition" && parseCfg(n).builderType === "if_else");
const ifTrue = lookupStatus === "found";
steps.push({
  step: steps.length + 1,
  phase: "automated",
  node: nodeDesc(ifNode),
  action: "Evaluate IF: lookup.status equals found",
  conditionEvaluated: `lookup.status (${lookupStatus}) equals "found"`,
  conditionResult: ifTrue,
  branchTaken: ifTrue ? "yes" : "no",
  nextNodeIfYes: nodeDesc(nodeById[(outEdges[ifNode?.id] ?? []).find((e) => e.condition?.branch === "yes")?.target_node_id]),
  nextNodeIfNo: nodeDesc(nodeById[(outEdges[ifNode?.id] ?? []).find((e) => e.condition?.branch === "no")?.target_node_id]),
  variablesAfter: {
    ...steps[steps.length - 1].variablesAfter,
    __branch: ifTrue ? "yes" : "no",
  },
});

// Next node after IF (what actually ran)
const nextAfterIf = ifTrue
  ? nodeById[(outEdges[ifNode?.id] ?? []).find((e) => e.condition?.branch === "yes")?.target_node_id]
  : nodeById[(outEdges[ifNode?.id] ?? []).find((e) => e.condition?.branch === "no")?.target_node_id];

if (nextAfterIf) {
  steps.push({
    step: steps.length + 1,
    phase: "automated",
    node: nodeDesc(nextAfterIf),
    action: parseCfg(nextAfterIf).action === "send_list"
      ? `Send lookup list (lookup=${parseCfg(nextAfterIf).lookup}) — NOT manual "Choose a doctor" list`
      : `Execute ${parseCfg(nextAfterIf).action}`,
    conditionResult: null,
    variablesAfter: run.variables,
    note: run.current_node_id === nextAfterIf.id ? "Run currently pinned here" : undefined,
  });
}

// Doctor list analysis
const manualDoctorList = (nodes ?? []).find((n) => {
  const c = parseCfg(n);
  return c.title === "Choose a doctor" && c.mode === "manual";
});
const bookDoctorList = (nodes ?? []).find((n) => parseCfg(n).lookup === "resources");

const report = {
  tracedAt: new Date().toISOString(),
  runId: RUN_ID,
  flowVersionId: VERSION,
  runStatus: run.status,
  currentNodeId: run.current_node_id,
  currentNode: nodeDesc(nodeById[run.current_node_id]),
  whyDoctorListNotSent: {
    summary: "The manual 'Choose a doctor' list (dr1/dr2/dr3) is on the Pricing branch, not the Book Appointment branch.",
    bookBranchAfterIfFound: "send_list with lookup=services (dynamic service picker)",
    bookBranchDoctorPicker: "send_list with lookup=resources (node a201f03d) — reached only after service + slot selection",
    pricingBranchDoctorList: nodeDesc(manualDoctorList),
    bookBranchResourceList: nodeDesc(bookDoctorList),
    ifUserExpectedManualDoctorList: "They pressed Book, not Pricing — workflow never routes to 8b43a352",
    ifUserExpectedResourceList: ifTrue
      ? "Customer was found; execution continued to services list. Resource/doctor list comes later in booking path."
      : "Customer not found; execution went to name/gender/age/create_customer path first.",
  },
  deliveryEvents: (deliveries ?? []).map((d) => ({
    created_at: d.created_at,
    status: d.delivery_status,
    text: d.payload?.text ?? d.payload?.outboundPayload?.text ?? d.payload?.metadata?.outboundPayload?.text,
    kind: d.payload?.outboundPayload?.kind ?? d.payload?.metadata?.outboundPayload?.kind,
    title: d.payload?.outboundPayload?.title,
  })),
  conversationMessages: convMessages.map((m) => ({
    created_at: m.created_at,
    direction: m.direction ?? m.role,
    content: typeof m.content === "string" ? m.content.slice(0, 80) : JSON.stringify(m.content).slice(0, 80),
  })),
  steps,
};

const outPath = resolve(root, "docs/architecture/book-workflow-step-by-step-trace.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
