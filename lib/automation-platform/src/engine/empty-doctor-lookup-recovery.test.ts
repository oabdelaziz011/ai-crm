import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createActionNodeHandler } from "./built-in-nodes.js";
import type { ExecutionContext } from "./execution-context.js";
import {
  ANOTHER_DOCTOR_SELECTION_ID,
  EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE,
  END_CHAT_SELECTION_ID,
  findPrecedingServicesListNode,
} from "../runtime/empty-doctor-lookup-recovery.js";
import { readOutboundQueue } from "../runtime/outbound-queue.js";
import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";

const SERVICES_ID = "11111111-1111-4111-8111-111111111111";
const DOCTORS_ID = "22222222-2222-4222-8222-222222222222";

function servicesNode(): AutomationNodeRecord {
  return {
    id: SERVICES_ID,
    flow_id: "flow-1",
    type: "action",
    config: {
      action: "send_list",
      lookup: "services",
      mode: "lookup",
      inputKey: "selected_service",
      title: "Services",
      body: "Pick a clinic",
    },
  } as AutomationNodeRecord;
}

function doctorsNode(): AutomationNodeRecord {
  return {
    id: DOCTORS_ID,
    flow_id: "flow-1",
    type: "action",
    config: {
      action: "send_list",
      lookup: "resources",
      mode: "lookup",
      inputKey: "selected_resource",
      title: "Doctors",
      body: "اختَر الطبيب الأنسب لك.",
    },
  } as AutomationNodeRecord;
}

function buildContext(input?: {
  resume?: Record<string, unknown>;
  variables?: Record<string, unknown>;
}): ExecutionContext {
  const services = servicesNode();
  const doctors = doctorsNode();
  const edges: AutomationEdgeRecord[] = [
    {
      id: "edge-1",
      flow_id: "flow-1",
      source_node_id: SERVICES_ID,
      target_node_id: DOCTORS_ID,
      condition: {},
    } as AutomationEdgeRecord,
  ];
  return {
    company: { id: "company-1" },
    flow: { id: "flow-1", company_id: "company-1", name: "Flow", status: "active" } as ExecutionContext["flow"],
    run: { id: "run-1", metadata: { actorUserId: "user-1" } } as ExecutionContext["run"],
    session: { id: "session-1", channel: "instagram", metadata: {} } as ExecutionContext["session"],
    variables: {
      conversation: { language: "ar" },
      ...(input?.variables ?? {}),
    },
    customer: { id: null },
    currentNode: doctors,
    nodes: [services, doctors],
    edges,
    input: input?.resume,
  };
}

describe("empty doctor catalog recovery", () => {
  const handler = createActionNodeHandler({
    lookupOptions: {
      async fetchListOptions() {
        return [];
      },
    },
  });

  it("asks to book another doctor or end the chat when the doctor list is empty", async () => {
    const result = await handler.execute(buildContext());
    assert.equal(result.outcome, "waiting_input");
    assert.equal(result.variables?.[EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE], true);
    assert.equal(result.variables?.__waitingFor, "interactive_selection");
    const queue = readOutboundQueue(result.variables ?? {});
    assert.equal(queue[0]?.kind, "text");
    assert.match(String(queue[0]?.text ?? ""), /لا توجد خيارات متاحة/);
    assert.equal(queue[1]?.kind, "buttons");
    assert.match(String(queue[1]?.text ?? ""), /دكتور تاني/);
    const buttons = (queue[1]?.buttons ?? []) as Array<{ id: string; label: string }>;
    assert.deepEqual(
      buttons.map((button) => button.id),
      [ANOTHER_DOCTOR_SELECTION_ID, END_CHAT_SELECTION_ID],
    );
  });

  it("redirects to the services list when the customer picks another doctor", async () => {
    const result = await handler.execute(
      buildContext({
        variables: { [EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE]: true },
        resume: { replyId: ANOTHER_DOCTOR_SELECTION_ID, interactionType: "button" },
      }),
    );
    assert.equal(result.outcome, "continue");
    assert.equal(result.output?.redirectToNodeId, SERVICES_ID);
    assert.equal(result.variables?.selected_resource, null);
    assert.equal(result.variables?.selected_service, null);
    assert.equal(result.variables?.[EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE], null);
  });

  it("ends the conversation when the customer chooses to stop", async () => {
    const result = await handler.execute(
      buildContext({
        variables: { [EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE]: true },
        resume: { replyId: END_CHAT_SELECTION_ID, interactionType: "button" },
      }),
    );
    assert.equal(result.outcome, "completed");
    const queue = readOutboundQueue(result.variables ?? {});
    assert.match(String(queue.at(-1)?.text ?? ""), /شكراً لحضرتك/);
  });

  it("finds the preceding services list node", () => {
    const found = findPrecedingServicesListNode(DOCTORS_ID, [servicesNode(), doctorsNode()], [
      {
        id: "edge-1",
        flow_id: "flow-1",
        source_node_id: SERVICES_ID,
        target_node_id: DOCTORS_ID,
        condition: {},
      } as AutomationEdgeRecord,
    ]);
    assert.equal(found?.id, SERVICES_ID);
  });
});
