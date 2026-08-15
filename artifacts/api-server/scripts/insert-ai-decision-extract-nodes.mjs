import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { randomUUID } from "crypto";
import {
  createDefaultDecisionNodeConfig,
  createDefaultExtractNodeConfig,
  patchDecisionMetadata,
  patchExtractMetadata,
  toAIWorkflowEngineConfig,
} from "@workspace/ai-workflow-platform";

config({ path: resolve("../../.env") });

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const BUTTONS_ID = "c397be7d-4a5c-453b-b6f8-5f0ee3ab07e5";
const SWITCH_ID = "26005451-73ca-4284-8379-5f86f2cca637";
const PHONE_ASK_ID = "71c6c8a9-9e68-4656-9dbd-c4b042d066e3";
const FIND_CUSTOMER_ID = "0de0cbdc-ca7f-4c94-93b5-3ae566289cfe";
const MARKER = "ai-decision-extract-v1";

const decisionId = randomUUID();
const extractId = randomUUID();

const decisionAi = patchDecisionMetadata(createDefaultDecisionNodeConfig(), {
  inputSource: "variable",
  inputVariable: "lastMessage",
  outcomes: [
    { id: "book", label: "book", description: "Book an appointment", examples: ["عايز أحجز", "book"] },
    { id: "pricing", label: "pricing", description: "Ask about prices, cost, or fees (أسعار / تكلفة)", examples: ["كام السعر", "pricing", "اسعار", "تكلفة", "اسعار وتكلفة", "عايز اسعار"] },
    { id: "support", label: "support", description: "Need support", examples: ["دعم", "support"] },
    { id: "other", label: "other", description: "Other intent", examples: ["مرحبا"] },
  ],
});

const extractAi = patchExtractMetadata(createDefaultExtractNodeConfig(), {
  inputSource: "variable",
  inputVariable: "lastMessage",
  schema: {
    fields: [
      {
        id: "field-name",
        name: "customer_name",
        type: "string",
        required: false,
        description: "Customer full name if present in the message",
        example: "أحمد محمد",
      },
      {
        id: "field-phone",
        name: "customer_phone",
        type: "string",
        required: false,
        description: "Customer phone number if present",
        example: "01001234567",
      },
    ],
  },
});

const decisionConfig = {
  builderType: "ai_decision",
  __valueorInsert: MARKER,
  ...toAIWorkflowEngineConfig(decisionAi),
};
const extractConfig = {
  builderType: "ai_extract",
  __valueorInsert: MARKER,
  ...toAIWorkflowEngineConfig(extractAi),
};

const { data: existing, error: existingError } = await client
  .from("automation_nodes")
  .select("id,config")
  .eq("flow_id", FLOW_ID);
if (existingError) throw existingError;

const prior = (existing || []).filter((n) => n.config?.__valueorInsert === MARKER);
if (prior.length) {
  const ids = prior.map((n) => n.id);
  await client.from("automation_edges").delete().in("source_node_id", ids);
  await client.from("automation_edges").delete().in("target_node_id", ids);
  await client.from("automation_nodes").delete().in("id", ids);
  console.log("cleaned prior inserts", ids.length);
}

const { error: n1 } = await client.from("automation_nodes").insert({
  id: decisionId,
  flow_id: FLOW_ID,
  type: "action",
  config: decisionConfig,
  position_x: 480,
  position_y: -860,
});
if (n1) throw n1;

const { error: n2 } = await client.from("automation_nodes").insert({
  id: extractId,
  flow_id: FLOW_ID,
  type: "action",
  config: extractConfig,
  position_x: 1540,
  position_y: -180,
});
if (n2) throw n2;

const { data: btnEdge, error: eBtn } = await client
  .from("automation_edges")
  .select("id")
  .eq("flow_id", FLOW_ID)
  .eq("source_node_id", BUTTONS_ID)
  .eq("target_node_id", SWITCH_ID)
  .maybeSingle();
if (eBtn) throw eBtn;

if (btnEdge?.id) {
  const { error } = await client
    .from("automation_edges")
    .update({ target_node_id: decisionId })
    .eq("id", btnEdge.id);
  if (error) throw error;
} else {
  // Maybe already pointed at a previous decision — force buttons -> decision
  await client.from("automation_edges").delete().eq("flow_id", FLOW_ID).eq("source_node_id", BUTTONS_ID);
  const { error } = await client.from("automation_edges").insert({
    flow_id: FLOW_ID,
    source_node_id: BUTTONS_ID,
    target_node_id: decisionId,
    condition: {},
  });
  if (error) throw error;
}

const { error: eDec } = await client.from("automation_edges").insert({
  flow_id: FLOW_ID,
  source_node_id: decisionId,
  target_node_id: SWITCH_ID,
  condition: {},
});
if (eDec) throw eDec;

const { data: phoneEdge, error: ePhone } = await client
  .from("automation_edges")
  .select("id")
  .eq("flow_id", FLOW_ID)
  .eq("source_node_id", PHONE_ASK_ID)
  .eq("target_node_id", FIND_CUSTOMER_ID)
  .maybeSingle();
if (ePhone) throw ePhone;

if (phoneEdge?.id) {
  const { error } = await client
    .from("automation_edges")
    .update({ target_node_id: extractId })
    .eq("id", phoneEdge.id);
  if (error) throw error;
} else {
  await client.from("automation_edges").delete().eq("flow_id", FLOW_ID).eq("source_node_id", PHONE_ASK_ID);
  const { error } = await client.from("automation_edges").insert({
    flow_id: FLOW_ID,
    source_node_id: PHONE_ASK_ID,
    target_node_id: extractId,
    condition: {},
  });
  if (error) throw error;
}

const { error: eExt } = await client.from("automation_edges").insert({
  flow_id: FLOW_ID,
  source_node_id: extractId,
  target_node_id: FIND_CUSTOMER_ID,
  condition: {},
});
if (eExt) throw eExt;

console.log(JSON.stringify({ ok: true, decisionId, extractId }, null, 2));
