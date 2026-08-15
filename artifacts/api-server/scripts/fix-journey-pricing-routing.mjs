/**
 * Fix journey flow (4003669c): AI Decision labels must route to Switch cases.
 * Also normalize pricing/booking/support/complaints outcomes + Arabic examples.
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
const DECISION_ID = "bfb31f3c-3b8f-49f8-95ed-4b3d2e36d21c";
const SWITCH_ID = "9006ebf7-d663-4bda-92a4-89abf933558e";

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
const decision = (snap.nodes ?? []).find((n) => n.id === DECISION_ID);
const sw = (snap.nodes ?? []).find((n) => n.id === SWITCH_ID);
if (!decision) throw new Error("AI Decision node missing");
if (!sw) throw new Error("Switch node missing");

// Switch values in this published flow:
// pricing → pricing list, finance → booking phone ask, support → support msg, complaints → complaint menu
sw.config = {
  ...sw.config,
  cases: [
    { id: "support", label: "Support", value: "support" },
    { id: "pricing", label: "Pricing", value: "pricing" },
    { id: "booking", label: "Booking", value: "finance" },
    { id: "complaints", label: "Complaints", value: "complaints" },
  ],
  field: "decision_result.value.label",
  includeDefault: true,
};

const decisionMeta = decision.config?.aiConfig?.metadata?.decision;
if (!decisionMeta) throw new Error("Decision metadata missing");

decisionMeta.outcomes = [
  {
    id: "pricing",
    label: "pricing",
    description: "Customer asks about prices, fees, cost, packages, or اسعار / تكلفة",
    examples: [
      "أسعار",
      "اسعار",
      "تكلفة",
      "كام السعر",
      "اسعار وتكلفة",
      "عايز اسعار",
      "pricing",
      "price",
      "cost",
      "باقات",
    ],
  },
  {
    id: "finance",
    label: "finance",
    description: "Customer wants to book an appointment / حجز موعد",
    examples: ["حجز", "موعد", "احجز", "عايز أحجز", "حجز موعد", "دكتور", "عيادة", "book"],
  },
  {
    id: "support",
    label: "support",
    description: "Customer needs human support / مساعدة عامة",
    examples: ["دعم", "مساعدة", "استفسار عام", "support", "help"],
  },
  {
    id: "complaints",
    label: "complaints",
    description: "Customer wants to raise or track a complaint / شكوى",
    examples: ["شكوى", "شكوي", "مشكلة", "تذكرة", "اعتراض", "complaint"],
  },
  {
    id: "other",
    label: "other",
    description: "Unclear intent — ask the customer to clarify",
    examples: ["مش واضح", "اهلا", "hello"],
  },
];
decisionMeta.fallbackOutcomeId = "other";
decisionMeta.confidencePolicy = {
  ...(decisionMeta.confidencePolicy ?? {}),
  minimumConfidence: 0.55,
  fallbackOutcomeId: "other",
  retryOnce: false,
  requireHumanReview: false,
  emitWarning: true,
  continueWorkflow: true,
};
decisionMeta.confidenceThreshold = 0.55;
decisionMeta.inputVariable = "customer_intent";
decisionMeta.inputSource = "variable";
decisionMeta.businessRules =
  "If the customer mentions أسعار / تكلفة / price / cost / باقات, choose pricing. " +
  "If they want حجز / موعد / book, choose finance. " +
  "If they need دعم / help, choose support. " +
  "If they mention شكوى / complaint, choose complaints. " +
  "Return the outcome label exactly as configured (lowercase).";

const { data, error } = await client.rpc("publish_automation_workflow_version", {
  p_flow_id: FLOW_ID,
  p_company_id: COMPANY_ID,
  p_release_notes:
    "Fix pricing routing: align AI Decision labels with Switch cases (pricing/finance/support/complaints)",
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
      decisionOutcomes: decisionMeta.outcomes.map((o) => o.label),
      switchCases: sw.config.cases.map((c) => c.value),
    },
    null,
    2,
  ),
);
