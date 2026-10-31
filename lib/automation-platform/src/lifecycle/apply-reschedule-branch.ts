/**
 * Additive reschedule branch for a published booking workflow snapshot.
 * Existing finance/cancel/support/pricing nodes and edges stay unchanged.
 */

export const V20_NODE_IDS = {
  decision: "a1000001-0001-4001-8001-000000000001",
  switch: "a1000001-0001-4001-8001-000000000002",
  financePhone: "a1000001-0001-4001-8001-000000000003",
  financeFindCustomer: "a1000001-0001-4001-8001-000000000004",
  bookingDates: "a1000001-0001-4001-8001-000000000005",
  bookingSlots: "a1000001-0001-4001-8001-000000000006",
  createBooking: "a1000001-0001-4001-8001-000000000007",
  hajaTanya: "a1000001-0001-4001-8001-000000000008",
  bookingConfirmation: "a1000001-0001-4001-8001-000000000009",
} as const;

export const RESCHEDULE_NODE_IDS = {
  phone: "b2000001-0001-4001-8001-000000000001",
  findCustomer: "b2000001-0001-4001-8001-000000000002",
  bookingsList: "b2000001-0001-4001-8001-000000000003",
  ifSelectedBooking: "b2000001-0001-4001-8001-000000000004",
  emptyBookings: "b2000001-0001-4001-8001-000000000005",
  dates: "b2000001-0001-4001-8001-000000000006",
  slots: "b2000001-0001-4001-8001-000000000007",
  action: "b2000001-0001-4001-8001-000000000008",
  ifSuccess: "b2000001-0001-4001-8001-000000000009",
  confirmation: "b2000001-0001-4001-8001-00000000000a",
  failure: "b2000001-0001-4001-8001-00000000000b",
} as const;

export const RESCHEDULE_EDGE_IDS = {
  switchToPhone: "c3000001-0001-4001-8001-000000000001",
  phoneToFind: "c3000001-0001-4001-8001-000000000002",
  findToList: "c3000001-0001-4001-8001-000000000003",
  listToIfBooking: "c3000001-0001-4001-8001-000000000004",
  ifBookingYes: "c3000001-0001-4001-8001-000000000005",
  ifBookingNo: "c3000001-0001-4001-8001-000000000006",
  emptyToHaja: "c3000001-0001-4001-8001-000000000007",
  datesToSlots: "c3000001-0001-4001-8001-000000000008",
  slotsToAction: "c3000001-0001-4001-8001-000000000009",
  actionToIfSuccess: "c3000001-0001-4001-8001-00000000000a",
  ifSuccessYes: "c3000001-0001-4001-8001-00000000000b",
  ifSuccessNo: "c3000001-0001-4001-8001-00000000000c",
  confirmationToHaja: "c3000001-0001-4001-8001-00000000000d",
  failureToHaja: "c3000001-0001-4001-8001-00000000000e",
} as const;

export const FINANCE_DECISION_EXAMPLES = [
  "حجز",
  "موعد",
  "عايزة أحجز موعد",
  "عايزة موعد",
  "احجز",
  "book",
] as const;

export const RESCHEDULE_DECISION_EXAMPLES = [
  "تغيير الموعد",
  "عايزة أغير الموعد",
  "عايزة أغير موعد الحجز",
  "عايز أغير الحجز",
  "أريد تغيير موعدي",
  "إعادة جدولة الموعد",
  "أعد جدولة الحجز",
  "ممكن أغير ميعاد الحجز؟",
  "reschedule",
  "reschedule my appointment",
  "change my appointment",
  "change booking",
] as const;

export const EMPTY_BOOKINGS_MESSAGE_AR = "لا توجد حجوزات لتغييرها.";

export const RESCHEDULE_CONFIRMATION_MESSAGE_AR =
  "تم تغيير الموعد بنجاح ✅\n{{selected_booking.service_name}} مع {{selected_booking.resource_name}}\n{{selected_date.display_date}} — {{selected_slot.display_time}}\nرقم التأكيد: {{booking.confirmation_number}}";

export type WorkflowSnapshotNode = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
};

export type WorkflowSnapshotEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition: Record<string, unknown>;
};

export type WorkflowSnapshot = {
  name: string;
  nodes: WorkflowSnapshotNode[];
  edges: WorkflowSnapshotEdge[];
};

export type DecisionOutcome = {
  id: string;
  label: string;
  examples?: string[];
  description?: string;
};

type ApplyResult = {
  snapshot: WorkflowSnapshot;
  addedNodeIds: string[];
  addedEdgeIds: string[];
};

function node(
  id: string,
  type: string,
  config: Record<string, unknown>,
  positionX: number,
  positionY: number,
): WorkflowSnapshotNode {
  return { id, type, config, positionX, positionY };
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  condition: Record<string, unknown> = {},
): WorkflowSnapshotEdge {
  return { id, sourceNodeId, targetNodeId, condition };
}

function decisionMetadata(snapshot: WorkflowSnapshot): Record<string, unknown> | null {
  const decision = snapshot.nodes.find((item) => item.id === V20_NODE_IDS.decision);
  const aiConfig = decision?.config.aiConfig;
  if (!aiConfig || typeof aiConfig !== "object") return null;
  const metadata = (aiConfig as { metadata?: { decision?: Record<string, unknown> } }).metadata;
  return metadata?.decision ?? null;
}

export function readDecisionOutcomes(snapshot: WorkflowSnapshot): DecisionOutcome[] {
  const decision = decisionMetadata(snapshot);
  const outcomes = decision?.outcomes;
  return Array.isArray(outcomes) ? (outcomes as DecisionOutcome[]) : [];
}

function shortList(lookup: string, titles: { ar: string; en: string }, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    action: "send_list",
    builderType: "list",
    mode: "lookup",
    lookup,
    title: titles.ar,
    titles,
    body: "اختَر الخيار الأنسب لك.",
    ...extra,
  };
}

export function applyRescheduleBranchToSnapshot(input: WorkflowSnapshot): ApplyResult {
  const snapshot = structuredClone(input);
  if (snapshot.nodes.some((item) => item.id === RESCHEDULE_NODE_IDS.phone)) {
    return { snapshot, addedNodeIds: [], addedEdgeIds: [] };
  }

  const decision = decisionMetadata(snapshot);
  if (decision && Array.isArray(decision.outcomes)) {
    const outcomes = decision.outcomes as DecisionOutcome[];
    if (!outcomes.some((item) => item.id === "reschedule")) {
      const financeIndex = outcomes.findIndex((item) => item.id === "finance");
      outcomes.splice(financeIndex + 1, 0, {
        id: "reschedule",
        label: "reschedule",
        examples: [...RESCHEDULE_DECISION_EXAMPLES],
        description: "Customer wants to change an existing appointment / تغيير الموعد",
      });
    }
  }

  const switchNode = snapshot.nodes.find((item) => item.id === V20_NODE_IDS.switch);
  const cases = switchNode?.config.cases;
  if (Array.isArray(cases) && !cases.some((item) => (item as { value?: string }).value === "reschedule")) {
    const financeIndex = cases.findIndex((item) => (item as { value?: string }).value === "finance");
    cases.splice(financeIndex + 1, 0, { id: "reschedule", label: "reschedule", value: "reschedule" });
  }

  const addedNodes: WorkflowSnapshotNode[] = [
    node(RESCHEDULE_NODE_IDS.phone, "action", {
      action: "wait_for_input",
      builderType: "ask_question",
      inputKey: "customer_phone",
      prompt: "ما هو رقم هاتفك ؟",
      prompts: { ar: "ما هو رقم هاتفك ؟", en: "What is your mobile number?" },
    }, 200, 0),
    node(RESCHEDULE_NODE_IDS.findCustomer, "action", {
      action: "find_customer",
      builderType: "find_customer",
      lookupBy: "phone",
      value: { mode: "variable", variable: "{{customer_phone}}" },
    }, 400, 0),
    node(RESCHEDULE_NODE_IDS.bookingsList, "action", shortList(
      "customer_scheduling_bookings",
      { ar: "اختر الحجز", en: "Pick a booking" },
      {
        filters: { customer_id: "{{customer.id}}" },
        displayField: "display_label",
        valueField: "id",
        outputVariable: "selected_booking",
        saveAs: "selected_booking",
      },
    ), 600, 0),
    node(RESCHEDULE_NODE_IDS.ifSelectedBooking, "condition", {
      mode: "if",
      builderType: "if",
      conditions: {
        root: {
          id: "root",
          combinator: "and",
          rules: [{ id: "rule-1", field: "selected_booking.id", operator: "is_not_empty" }],
        },
      },
    }, 800, 0),
    node(RESCHEDULE_NODE_IDS.emptyBookings, "action", {
      action: "send_message",
      builderType: "message",
      message: EMPTY_BOOKINGS_MESSAGE_AR,
    }, 1000, 160),
    node(RESCHEDULE_NODE_IDS.dates, "action", shortList(
      "available_dates",
      { ar: "اختر التاريخ", en: "Choose a date" },
      {
        filters: {
          days_ahead: "14",
          service_id: "{{selected_booking.service_id}}",
          resource_id: "{{selected_booking.resource_id}}",
        },
        displayField: "display_date",
        valueField: "date",
        outputVariable: "selected_date",
        saveAs: "selected_date",
      },
    ), 1000, -80),
    node(RESCHEDULE_NODE_IDS.slots, "action", shortList(
      "available_slots",
      { ar: "اختر الوقت", en: "Choose a time" },
      {
        filters: {
          date: "{{selected_date}}",
          service_id: "{{selected_booking.service_id}}",
          resource_id: "{{selected_booking.resource_id}}",
        },
        displayField: "display_time",
        valueField: "start_at",
        outputVariable: "selected_slot",
        saveAs: "selected_slot",
      },
    ), 1200, -80),
    node(RESCHEDULE_NODE_IDS.action, "action", {
      action: "reschedule_booking",
      builderType: "reschedule_booking",
      bookingId: { mode: "variable", variable: "{{selected_booking.id}}" },
      date: { mode: "variable", variable: "{{selected_date}}" },
      slotStart: { mode: "variable", variable: "{{selected_slot.start_at}}" },
    }, 1400, -80),
    node(RESCHEDULE_NODE_IDS.ifSuccess, "condition", {
      mode: "if",
      builderType: "if",
      conditions: {
        root: {
          id: "root",
          combinator: "and",
          rules: [{ id: "rule-1", field: "reschedule.success", operator: "boolean_true" }],
        },
      },
    }, 1600, -80),
    node(RESCHEDULE_NODE_IDS.confirmation, "action", {
      action: "send_message",
      builderType: "message",
      message: RESCHEDULE_CONFIRMATION_MESSAGE_AR,
    }, 1800, -160),
    node(RESCHEDULE_NODE_IDS.failure, "action", {
      action: "send_message",
      builderType: "message",
      message: "تعذر تغيير الموعد. حاول مرة أخرى.",
    }, 1800, 0),
  ];

  const addedEdges: WorkflowSnapshotEdge[] = [
    edge(RESCHEDULE_EDGE_IDS.switchToPhone, V20_NODE_IDS.switch, RESCHEDULE_NODE_IDS.phone, {
      case: "reschedule",
      label: "reschedule",
    }),
    edge(RESCHEDULE_EDGE_IDS.phoneToFind, RESCHEDULE_NODE_IDS.phone, RESCHEDULE_NODE_IDS.findCustomer),
    edge(RESCHEDULE_EDGE_IDS.findToList, RESCHEDULE_NODE_IDS.findCustomer, RESCHEDULE_NODE_IDS.bookingsList),
    edge(RESCHEDULE_EDGE_IDS.listToIfBooking, RESCHEDULE_NODE_IDS.bookingsList, RESCHEDULE_NODE_IDS.ifSelectedBooking),
    edge(RESCHEDULE_EDGE_IDS.ifBookingYes, RESCHEDULE_NODE_IDS.ifSelectedBooking, RESCHEDULE_NODE_IDS.dates, { branch: "yes" }),
    edge(RESCHEDULE_EDGE_IDS.ifBookingNo, RESCHEDULE_NODE_IDS.ifSelectedBooking, RESCHEDULE_NODE_IDS.emptyBookings, { branch: "no" }),
    edge(RESCHEDULE_EDGE_IDS.emptyToHaja, RESCHEDULE_NODE_IDS.emptyBookings, V20_NODE_IDS.hajaTanya),
    edge(RESCHEDULE_EDGE_IDS.datesToSlots, RESCHEDULE_NODE_IDS.dates, RESCHEDULE_NODE_IDS.slots),
    edge(RESCHEDULE_EDGE_IDS.slotsToAction, RESCHEDULE_NODE_IDS.slots, RESCHEDULE_NODE_IDS.action),
    edge(RESCHEDULE_EDGE_IDS.actionToIfSuccess, RESCHEDULE_NODE_IDS.action, RESCHEDULE_NODE_IDS.ifSuccess),
    edge(RESCHEDULE_EDGE_IDS.ifSuccessYes, RESCHEDULE_NODE_IDS.ifSuccess, RESCHEDULE_NODE_IDS.confirmation, { branch: "yes" }),
    edge(RESCHEDULE_EDGE_IDS.ifSuccessNo, RESCHEDULE_NODE_IDS.ifSuccess, RESCHEDULE_NODE_IDS.failure, { branch: "no" }),
    edge(RESCHEDULE_EDGE_IDS.confirmationToHaja, RESCHEDULE_NODE_IDS.confirmation, V20_NODE_IDS.hajaTanya),
    edge(RESCHEDULE_EDGE_IDS.failureToHaja, RESCHEDULE_NODE_IDS.failure, V20_NODE_IDS.hajaTanya),
  ];

  snapshot.nodes.push(...addedNodes);
  snapshot.edges.push(...addedEdges);
  return {
    snapshot,
    addedNodeIds: addedNodes.map((item) => item.id),
    addedEdgeIds: addedEdges.map((item) => item.id),
  };
}
