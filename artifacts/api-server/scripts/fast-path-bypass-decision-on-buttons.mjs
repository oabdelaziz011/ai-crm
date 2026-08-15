/**
 * Perf: restore Buttons → Switch on the *published* snapshot.
 * Live automation_nodes/edges may diverge; WhatsApp runtime uses active version.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { randomUUID } from "crypto";

config({ path: resolve("../../.env") });

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const BUTTONS_ID = "c397be7d-4a5c-453b-b6f8-5f0ee3ab07e5";

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
const nodes = snap.nodes ?? [];
const edges = snap.edges ?? [];
const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

const decision = nodes.find((n) => n.config?.builderType === "ai_decision");
if (!decision) throw new Error("ai_decision missing in published snapshot");

const fromButtons = edges.filter((e) => e.sourceNodeId === BUTTONS_ID);
const fromDecision = edges.filter((e) => e.sourceNodeId === decision.id);
const switchId =
  fromDecision.find((e) => byId[e.targetNodeId]?.config?.mode === "switch")?.targetNodeId ??
  fromDecision[0]?.targetNodeId;

if (!switchId) throw new Error("switch after decision not found");

console.log(
  JSON.stringify(
    {
      baseVersion: ver.version_number,
      decisionId: decision.id,
      switchId,
      buttonsTargetsBefore: fromButtons.map((e) => ({
        to: e.targetNodeId,
        type: byId[e.targetNodeId]?.config?.builderType ?? byId[e.targetNodeId]?.type,
      })),
      decisionTargetsBefore: fromDecision.map((e) => e.targetNodeId),
    },
    null,
    2,
  ),
);

snap.edges = edges.filter(
  (e) =>
    !(e.sourceNodeId === BUTTONS_ID) &&
    !(e.sourceNodeId === decision.id && e.targetNodeId === switchId),
);
snap.edges.push({
  id: randomUUID(),
  sourceNodeId: BUTTONS_ID,
  targetNodeId: switchId,
  condition: {},
});

const btnOut = snap.edges.filter((e) => e.sourceNodeId === BUTTONS_ID);
if (btnOut.length !== 1 || btnOut[0].targetNodeId !== switchId) {
  throw new Error(`Buttons wiring unexpected: ${JSON.stringify(btnOut)}`);
}

// Keep Decision node in snapshot (unused) so UI/extract stay intact; no Decision→Switch edge.
const decisionStillLinked = snap.edges.some(
  (e) => e.sourceNodeId === decision.id || e.targetNodeId === decision.id,
);
console.log({ decisionStillLinked });

const { data, error } = await client.rpc("publish_automation_workflow_version", {
  p_flow_id: FLOW_ID,
  p_company_id: COMPANY_ID,
  p_release_notes:
    "Perf: Buttons→Switch instant path; remove AI Decision LLM from menu button resume",
  p_snapshot: snap,
  p_published_by: null,
  p_flow_name: snap.name ?? flow.name,
  p_flow_description: snap.description ?? flow.description ?? "",
  p_flow_trigger_type: snap.triggerType ?? flow.trigger_type,
  p_flow_metadata: snap.metadata ?? flow.metadata ?? {},
  p_updated_by: null,
});

if (error) throw error;

const { data: after } = await client
  .from("automation_flows")
  .select("active_version_id")
  .eq("id", FLOW_ID)
  .single();
const { data: afterVer } = await client
  .from("automation_flow_versions")
  .select("version_number,snapshot")
  .eq("id", after.active_version_id)
  .single();

const aEdges = afterVer.snapshot.edges ?? [];
const aNodes = afterVer.snapshot.nodes ?? [];
const aById = Object.fromEntries(aNodes.map((n) => [n.id, n]));

console.log(
  JSON.stringify(
    {
      published: data,
      version: afterVer.version_number,
      buttonsTo: aEdges
        .filter((e) => e.sourceNodeId === BUTTONS_ID)
        .map((e) => ({
          to: e.targetNodeId,
          type: aById[e.targetNodeId]?.config?.builderType ?? aById[e.targetNodeId]?.config?.mode,
        })),
      decisionOutgoing: aEdges.filter((e) => e.sourceNodeId === decision.id).length,
      hasExtract: aNodes.some((n) => n.config?.builderType === "ai_extract"),
      hasDecision: aNodes.some((n) => n.config?.builderType === "ai_decision"),
    },
    null,
    2,
  ),
);
