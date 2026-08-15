/**
 * Bypass AI Extract on the booking phone path until workflow_extract
 * prompt templates exist in this tenant. Keeps the extract node in the graph.
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
const PHONE_ASK_ID = "71c6c8a9-9e68-4656-9dbd-c4b042d066e3";
const FIND_CUSTOMER_ID = "0de0cbdc-ca7f-4c94-93b5-3ae566289cfe";

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
const extract = nodes.find((n) => n.config?.builderType === "ai_extract");
if (!extract) throw new Error("ai_extract missing");

const phoneOutBefore = edges.filter((e) => e.sourceNodeId === PHONE_ASK_ID);
const extractOutBefore = edges.filter((e) => e.sourceNodeId === extract.id);
console.log({
  baseVersion: ver.version_number,
  extractId: extract.id,
  phoneOutBefore,
  extractOutBefore,
});

snap.edges = edges.filter(
  (e) =>
    e.sourceNodeId !== PHONE_ASK_ID &&
    e.sourceNodeId !== extract.id &&
    e.targetNodeId !== extract.id,
);
snap.edges.push({
  id: randomUUID(),
  sourceNodeId: PHONE_ASK_ID,
  targetNodeId: FIND_CUSTOMER_ID,
  condition: {},
});

const { data, error } = await client.rpc("publish_automation_workflow_version", {
  p_flow_id: FLOW_ID,
  p_company_id: COMPANY_ID,
  p_release_notes:
    "Bypass AI Extract on booking path until workflow_extract prompt template is seeded",
  p_snapshot: snap,
  p_published_by: null,
  p_flow_name: snap.name ?? flow.name,
  p_flow_description: snap.description ?? flow.description ?? "",
  p_flow_trigger_type: snap.triggerType ?? flow.trigger_type,
  p_flow_metadata: snap.metadata ?? flow.metadata ?? {},
  p_updated_by: null,
});
if (error) throw error;

const { data: afterFlow } = await client
  .from("automation_flows")
  .select("active_version_id")
  .eq("id", FLOW_ID)
  .single();
const { data: afterVer } = await client
  .from("automation_flow_versions")
  .select("version_number,snapshot")
  .eq("id", afterFlow.active_version_id)
  .single();

console.log(
  JSON.stringify(
    {
      published: data,
      version: afterVer.version_number,
      phoneTo: (afterVer.snapshot.edges ?? [])
        .filter((e) => e.sourceNodeId === PHONE_ASK_ID)
        .map((e) => e.targetNodeId),
      extractLinked: (afterVer.snapshot.edges ?? []).some(
        (e) => e.sourceNodeId === extract.id || e.targetNodeId === extract.id,
      ),
    },
    null,
    2,
  ),
);
