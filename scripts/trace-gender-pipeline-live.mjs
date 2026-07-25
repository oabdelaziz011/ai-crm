/**
 * Gender-only trace for latest REAL WhatsApp execution (no simulation).
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
      if (m) env[m[1]] = env[m[1]] ?? m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function isListReplyMessage(msg) {
  const s = JSON.stringify({ content: msg.content, metadata: msg.metadata });
  return s.includes("list_reply") || s.includes('"interactionType":"list_reply"') || s.includes("interactive_reply");
}

function extractListReply(msg) {
  const meta = msg.metadata ?? {};
  const content = msg.content ?? {};
  return {
    replyId: meta.replyId ?? content.replyId ?? meta.listReplyId ?? null,
    title: meta.title ?? content.title ?? null,
    interactionType: meta.interactionType ?? meta.kind ?? null,
    rawMetadata: meta,
    rawContent: content,
  };
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), flowId: FLOW_ID, steps: {} };

  // Latest WhatsApp conversation
  const { data: conversations } = await sb
    .from("conversations")
    .select("id, conversation_number, customer_id, company_id, external_thread_id, last_message_at, created_at")
    .eq("channel_type", "whatsapp")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(5);

  const latestConv = conversations?.[0] ?? null;
  report.steps.latestWhatsAppConversation = latestConv;

  if (!latestConv) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // All messages in that conversation (chronological)
  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("id, message_type, content, metadata, created_at")
    .eq("conversation_id", latestConv.id)
    .order("created_at", { ascending: true });

  const listReplies = (msgs ?? []).filter(isListReplyMessage);
  const latestListReply = listReplies[listReplies.length - 1] ?? null;

  report.steps.allListRepliesInConversation = listReplies.map((m) => ({
    id: m.id,
    created_at: m.created_at,
    ...extractListReply(m),
  }));

  report.steps.step1_interactiveListSelected = latestListReply
    ? {
        messageId: latestListReply.id,
        created_at: latestListReply.created_at,
        listReply: extractListReply(latestListReply),
      }
    : null;

  // Find automation run tied to this conversation / wa user
  const { data: runs } = await sb
    .from("automation_runs")
    .select("*")
    .eq("flow_id", FLOW_ID)
    .order("started_at", { ascending: false })
    .limit(30);

  // Match run by conversation variable or time window around list reply
  const listReplyAt = latestListReply?.created_at ? new Date(latestListReply.created_at).getTime() : null;

  const candidateRuns = (runs ?? []).filter((r) => {
    const convId = r.variables?.conversation?.id ?? r.variables?.conversation_id;
    if (convId && convId === latestConv.id) return true;
    if (listReplyAt && r.started_at) {
      const started = new Date(r.started_at).getTime();
      const finished = r.finished_at ? new Date(r.finished_at).getTime() : Date.now();
      return listReplyAt >= started - 60000 && listReplyAt <= finished + 600000;
    }
    return false;
  });

  const selectedRun =
    candidateRuns.find((r) => r.variables?.customer?.id) ??
    candidateRuns[0] ??
    (runs ?? []).find((r) => r.variables?.customer_gender != null) ??
    runs?.[0] ??
    null;

  report.steps.selectedRun = selectedRun
    ? {
        id: selectedRun.id,
        status: selectedRun.status,
        flow_version_id: selectedRun.flow_version_id,
        started_at: selectedRun.started_at,
        finished_at: selectedRun.finished_at,
        current_node_id: selectedRun.current_node_id,
        error_message: selectedRun.error_message,
      }
    : null;

  if (selectedRun) {
    const vars = selectedRun.variables ?? {};

    report.steps.step2_afterListReply_workflowVariables = {
      customer_gender_exists: Object.prototype.hasOwnProperty.call(vars, "customer_gender"),
      customer_gender_value: vars.customer_gender ?? null,
      customer_gender_type: vars.customer_gender === undefined ? "undefined" : typeof vars.customer_gender,
      relatedKeys: Object.keys(vars)
        .filter((k) => k.toLowerCase().includes("gender"))
        .reduce((acc, k) => ({ ...acc, [k]: vars[k] }), {}),
      topLevelKeys: Object.keys(vars).filter((k) => !k.startsWith("__")).sort(),
    };

    // Version nodes for create customer + gender list
    const { data: versionNodes } = await sb
      .from("automation_flow_version_nodes")
      .select("id, type, config")
      .eq("flow_version_id", selectedRun.flow_version_id);

    const genderListNode = (versionNodes ?? []).find(
      (n) =>
        n.config?.inputKey === "customer_gender" ||
        n.config?.saveAs === "customer_gender" ||
        String(n.config?.body ?? "").toLowerCase().includes("gender"),
    );
    const createCustomerNode = (versionNodes ?? []).find((n) => n.config?.action === "create_customer");

    report.steps.genderListNodeConfig = genderListNode
      ? {
          id: genderListNode.id,
          inputKey: genderListNode.config?.inputKey,
          saveAs: genderListNode.config?.saveAs,
          rows: genderListNode.config?.sections?.[0]?.rows ?? genderListNode.config?.rows,
        }
      : null;

    report.steps.step3_createCustomerNodeConfig = createCustomerNode
      ? {
          id: createCustomerNode.id,
          genderField: createCustomerNode.config?.genderField ?? null,
          nameField: createCustomerNode.config?.nameField,
          phoneField: createCustomerNode.config?.phoneField,
          ageField: createCustomerNode.config?.ageField,
        }
      : null;

    const genderField = createCustomerNode?.config?.genderField ?? "customer_gender";
    const resolvedGenderFromVars = vars[genderField] ?? null;

    report.steps.step3_genderFieldResolvedBeforeCreateCustomer = {
      genderField,
      resolvedValue: resolvedGenderFromVars,
      resolvedType: resolvedGenderFromVars === undefined ? "undefined" : typeof resolvedGenderFromVars,
    };

    // Run events / node executions if available
    const { data: events } = await sb
      .from("automation_run_events")
      .select("*")
      .eq("run_id", selectedRun.id)
      .order("created_at", { ascending: true });

    report.steps.runEvents = (events ?? []).map((e) => ({
      id: e.id,
      event_type: e.event_type,
      node_id: e.node_id,
      created_at: e.created_at,
      payloadPreview: JSON.stringify(e.payload ?? e.data ?? {}).slice(0, 500),
    }));

    const createEvent = (events ?? []).find(
      (e) =>
        e.node_id === createCustomerNode?.id ||
        JSON.stringify(e.payload ?? e.data ?? {}).includes("createCustomer") ||
        JSON.stringify(e.payload ?? e.data ?? {}).includes("create_customer"),
    );
    report.steps.createCustomerEvent = createEvent ?? null;

    report.steps.step4_customerServiceCreateCustomer = {
      fromRunVariablesCustomerEntity: vars.customer
        ? {
            id: vars.customer.id,
            gender: vars.customer.gender ?? null,
            genderType: vars.customer.gender === undefined ? "undefined" : typeof vars.customer.gender,
            age: vars.customer.age ?? null,
          }
        : null,
      inferredPayloadFromVariables: {
        gender: resolvedGenderFromVars?.trim?.() || null,
        note: "No separate audit log of createCustomer() call in DB; inferred from run variables at create_customer node output",
      },
    };
  }

  const customerId = selectedRun?.variables?.customer?.id ?? latestConv.customer_id ?? null;

  if (customerId) {
    const { data: customerRow } = await sb.from("customers").select("*").eq("id", customerId).single();
    report.steps.step5_databaseInsert = {
      customerId,
      customers_gender: customerRow?.gender ?? null,
      customers_gender_type: customerRow?.gender === undefined ? "undefined" : typeof customerRow?.gender,
      customers_age: customerRow?.age ?? null,
      fullRow: customerRow,
    };

    // Simulate API path: what useCustomer / customers API returns
    const { data: apiSelect } = await sb
      .from("customers")
      .select("id, name, phone, email, age, gender, notes, created_at, updated_at")
      .eq("id", customerId)
      .single();

    report.steps.step6_apiReactQueryPayload = apiSelect;

    // UI mapping analysis
    const dbGender = apiSelect?.gender ?? null;
    const selectValues = ["Male", "Female", "Other", "Prefer not to say"];
    const canonicalAliases = { male: "Male", female: "Female", other: "Other", "prefer not to say": "Prefer not to say" };
    const canonical = dbGender ? (canonicalAliases[dbGender.toLowerCase()] ?? dbGender) : "";
    const matchesOption = selectValues.includes(canonical);
    const selectValueWouldBe = dbGender ?? "";

    report.steps.step6_customerDetailsDialogAnalysis = {
      dbGender,
      selectValueProp: selectValueWouldBe,
      canonicalGenderForLabel: canonical,
      matchesSelectOption: matchesOption,
      dropdownEmptyReason:
        dbGender == null
          ? "customers.gender is NULL in DB"
          : !matchesOption && !selectValues.includes(dbGender)
            ? `Select value="${dbGender}" does not match any SelectItem value in [Male, Female, Other, Prefer not to say] — Radix Select shows empty when value has no matching item`
            : "value should display",
      lossPoint:
        dbGender == null
          ? "LOST BEFORE UI: customers.gender is NULL (Create Customer or earlier pipeline step)"
          : !matchesOption && dbGender.toLowerCase() === "female"
            ? "LOST IN UI: customer-details-dialog.tsx InlineEditableField passes value={customer.gender} (lowercase) to Select but SelectItem values are capitalized (Female) — see customer-details-dialog.tsx ~287-294"
            : null,
    };
  }

  // Resolve expected stored value from list node config + reply id
  if (report.steps.step1_interactiveListSelected && report.steps.genderListNodeConfig) {
    const replyId = report.steps.step1_interactiveListSelected.listReply.replyId;
    const rows = report.steps.genderListNodeConfig.rows ?? [];
    const matched = rows.find((r) => r.id === replyId);
    report.steps.step1_expectedStoredValue = {
      replyId,
      matchedRow: matched ?? null,
      expectedStoredValue: matched?.value ?? matched?.id ?? replyId,
    };
  }

  mkdirSync(resolve(root, "docs/architecture"), { recursive: true });
  const outPath = resolve(root, "docs/architecture/gender-pipeline-live-trace.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error("\nWrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
