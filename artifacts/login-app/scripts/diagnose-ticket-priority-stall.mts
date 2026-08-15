import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const p of [resolve("../../.env"), resolve(".env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]!] ??= m[2]!.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const FLOW_ID = "4003669c-12fb-44b3-9835-a655bd8ba5d6";

const { data: flow } = await admin.from("automation_flows").select("active_version_id,version").eq("id", FLOW_ID).single();
const versionId = flow!.active_version_id!;
console.log("FLOW", flow);

const { data: runs } = await admin
  .from("automation_runs")
  .select("*")
  .eq("flow_id", FLOW_ID)
  .order("started_at", { ascending: false })
  .limit(5);

for (const r of runs ?? []) {
  const v = (r.variables as Record<string, unknown>) ?? {};
  console.log("\n=== RUN", r.id, "===");
  console.log({
    status: r.status,
    err: r.error_message,
    node: r.current_node_id,
    ver: (r.metadata as { flowVersionId?: string; flowVersionNumber?: number } | null),
    wait: v.__waitingFor,
    intent: v.customer_intent,
    decision: (v.decision_result as { value?: { label?: string; confidence?: number } } | undefined)?.value,
    outbound: (v.__outbound as { kind?: string; text?: string; body?: string } | undefined),
    queue: ((v.__outboundQueue as unknown[]) ?? []).slice(-3).map((e) => {
      const x = e as Record<string, unknown>;
      return {
        kind: x.kind,
        text: typeof x.text === "string" ? x.text.slice(0, 100) : undefined,
        body: typeof x.body === "string" ? x.body.slice(0, 100) : undefined,
        buttons: x.buttons,
        sections: x.sections,
      };
    }),
    ticketSubject: v.ticket_subject,
    ticketDescription: v.ticket_description,
    ticketPriority: v.ticket_priority,
    priority: v.priority,
    interactive: v.conversation,
    lastMessage: v.lastMessage,
  });
}

const { data: nodes } = await admin
  .from("automation_flow_version_nodes")
  .select("id,type,config")
  .eq("flow_version_id", versionId);

const interesting = (nodes ?? [])
  .map((n) => {
    const cfg = (n.config as Record<string, unknown>) ?? {};
    const action = String(cfg.action ?? cfg.builderType ?? "");
    const text = String(cfg.prompt ?? cfg.message ?? cfg.body ?? cfg.text ?? "");
    const labelHint = /prior|أولوي|ticket|شكو|create_ticket|send_buttons|send_list|wait_for/i.test(
      action + text + JSON.stringify(cfg).slice(0, 300),
    );
    if (!labelHint && !/ticket|prior|complaint|شكو|أولوي/i.test(JSON.stringify(cfg))) return null;
    return {
      id: n.id,
      type: n.type,
      action,
      saveAs: cfg.saveAs ?? cfg.inputKey,
      prompt: typeof cfg.prompt === "string" ? cfg.prompt.slice(0, 80) : undefined,
      message: typeof cfg.message === "string" ? cfg.message.slice(0, 80) : undefined,
      buttons: cfg.buttons,
      fieldBindings: cfg.fieldBindings,
      priority: cfg.priority,
      keys: Object.keys(cfg).slice(0, 25),
    };
  })
  .filter(Boolean);

console.log("\nTICKET-RELATED NODES", JSON.stringify(interesting, null, 2));

// edges around create ticket / priority
const stuck = runs?.[0]?.current_node_id;
if (stuck) {
  const { data: edges } = await admin
    .from("automation_flow_version_edges")
    .select("id,source_node_id,target_node_id,condition")
    .eq("flow_version_id", versionId)
    .or(`source_node_id.eq.${stuck},target_node_id.eq.${stuck}`);
  console.log("\nEDGES around stuck", edges);

  const { data: stuckNode } = await admin
    .from("automation_flow_version_nodes")
    .select("id,type,config")
    .eq("flow_version_id", versionId)
    .eq("id", stuck)
    .maybeSingle();
  console.log("\nSTUCK NODE FULL CONFIG", JSON.stringify(stuckNode, null, 2));
}
