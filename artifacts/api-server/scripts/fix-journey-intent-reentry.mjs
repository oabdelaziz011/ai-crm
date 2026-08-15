/**
 * After each branch finishes, loop back to AI intent routing instead of End/welcome.
 * Also wire clarify → AI Decision (was a dead end).
 *
 * Flow: 4003669c (رحلة كاملة)
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve("../../.env") });

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const FLOW_ID = "4003669c-12fb-44b3-9835-a655bd8ba5d6";
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const END_ID = "f3b169da-57c1-4298-8965-44bdec5dddf2";
const DECISION_ID = "bfb31f3c-3b8f-49f8-95ed-4b3d2e36d21c";
const CLARIFY_ID = "1cad0ae3-6b6e-4a57-ace0-0ce3786ade9a";
const REENTRY_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

const { data: flow, error: flowError } = await client
  .from("automation_flows")
  .select("*")
  .eq("id", FLOW_ID)
  .single();
if (flowError) throw flowError;

const { data: ver, error: verError } = await client
  .from("automation_flow_versions")
  .select("id,version_number,snapshot")
  .eq("id", flow.active_version_id)
  .single();
if (verError) throw verError;

const snap = structuredClone(ver.snapshot);
snap.nodes = snap.nodes ?? [];
snap.edges = snap.edges ?? [];

const decision = snap.nodes.find((n) => n.id === DECISION_ID);
if (!decision) throw new Error("AI Decision node missing");

const clarify = snap.nodes.find((n) => n.id === CLARIFY_ID);
if (!clarify) throw new Error("Clarify ask node missing");

// Silent wait: no prompt — next customer message feeds AI Decision.
let reentry = snap.nodes.find((n) => n.id === REENTRY_ID);
if (!reentry) {
  reentry = {
    id: REENTRY_ID,
    type: "action",
    positionX: -400,
    positionY: 320,
    config: {
      action: "wait_for_input",
      inputKey: "customer_intent",
      prompt: "",
      prompts: { ar: "", en: "" },
      question: "",
      questions: { ar: "", en: "" },
      builderType: "ask_question",
    },
  };
  snap.nodes.push(reentry);
} else {
  reentry.config = {
    ...reentry.config,
    action: "wait_for_input",
    inputKey: "customer_intent",
    prompt: "",
    prompts: { ar: "", en: "" },
    question: "",
    questions: { ar: "", en: "" },
    builderType: "ask_question",
  };
}

let rewiredToReentry = 0;
for (const edge of snap.edges) {
  if (edge.targetNodeId === END_ID) {
    edge.targetNodeId = REENTRY_ID;
    rewiredToReentry += 1;
  }
}

const hasReentryToDecision = snap.edges.some(
  (e) => e.sourceNodeId === REENTRY_ID && e.targetNodeId === DECISION_ID,
);
if (!hasReentryToDecision) {
  snap.edges.push({
    id: `${REENTRY_ID}->${DECISION_ID}`,
    condition: {},
    sourceNodeId: REENTRY_ID,
    targetNodeId: DECISION_ID,
  });
}

const hasClarifyToDecision = snap.edges.some(
  (e) => e.sourceNodeId === CLARIFY_ID && e.targetNodeId === DECISION_ID,
);
if (!hasClarifyToDecision) {
  snap.edges.push({
    id: `${CLARIFY_ID}->${DECISION_ID}`,
    condition: {},
    sourceNodeId: CLARIFY_ID,
    targetNodeId: DECISION_ID,
  });
}

const { data, error } = await client.rpc("publish_automation_workflow_version", {
  p_flow_id: FLOW_ID,
  p_company_id: COMPANY_ID,
  p_release_notes:
    "Intent re-entry: after each branch, wait silently for next message → AI Decision (no welcome/end). Wire clarify → decision.",
  p_snapshot: snap,
  p_published_by: null,
  p_flow_name: snap.name ?? flow.name,
  p_flow_description: snap.description ?? flow.description ?? "",
  p_flow_trigger_type: snap.triggerType ?? flow.trigger_type,
  p_flow_metadata: snap.metadata ?? flow.metadata ?? {},
  p_updated_by: null,
});
if (error) throw error;

console.log(
  JSON.stringify(
    {
      published: data,
      fromVersion: ver.version_number,
      rewiredToReentry,
      reentryId: REENTRY_ID,
      clarifyWired: true,
    },
    null,
    2,
  ),
);
