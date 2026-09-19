import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateDecisionResult } from "@workspace/ai-workflow-platform";
import { evaluateIfElseCondition, evaluateSwitchCase } from "../logic/condition-evaluator.js";
import { interpolateTemplateString } from "../logic/expression-engine.js";
import { normalizeRescheduleBookingConfig } from "../crm/reschedule-booking-config.js";
import { readBindingString } from "../field-binding/normalize.js";
import { resolveNextNodeId } from "../engine/flow-graph.js";
import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";
import {
  applyRescheduleBranchToSnapshot,
  EMPTY_BOOKINGS_MESSAGE_AR,
  FINANCE_DECISION_EXAMPLES,
  readDecisionOutcomes,
  RESCHEDULE_CONFIRMATION_MESSAGE_AR,
  RESCHEDULE_DECISION_EXAMPLES,
  RESCHEDULE_EDGE_IDS,
  RESCHEDULE_NODE_IDS,
  V20_NODE_IDS,
  type WorkflowSnapshot,
  type WorkflowSnapshotEdge,
  type WorkflowSnapshotNode,
} from "./apply-reschedule-branch.js";

const INSTAGRAM_TITLE_MAX = 20;

const V20_DECISION_CONFIG = {
  action: "ai_workflow",
  builderType: "ai_decision",
  aiNodeKey: "ai.decision",
  aiConfig: {
    nodeKey: "ai.decision",
    outputVariable: "decision_result",
    metadata: {
      decision: {
        inputSource: "variable",
        inputVariable: "customer_intent",
        decisionMode: "intent_classification",
        fallbackOutcomeId: "other",
        confidenceThreshold: 0.55,
        confidencePolicy: {
          retryOnce: false,
          emitWarning: true,
          continueWorkflow: true,
          fallbackOutcomeId: "other",
          minimumConfidence: 0.55,
          requireHumanReview: false,
        },
        businessRules:
          "Return the outcome label exactly as configured (lowercase).\n\nChoose \"cancel\" when the customer wants to cancel, undo, or delete an existing appointment or booking (الغي / ألغي / إلغاء الميعاد / إلغاء الحجز / cancel).\nChoose \"finance\" when they want to book a new appointment (حجز / موعد / احجز / book) and they are not cancelling.\nChoose \"pricing\" when they mention أسعار / تكلفة / price / cost / باقات.\nChoose \"support\" when they need دعم / help.\nChoose \"complaints\" when they mention شكوى / complaint / تذكرة.\nChoose \"other\" when the intent is unclear.",
        outcomes: [
          {
            id: "pricing",
            label: "pricing",
            examples: ["أسعار", "اسعار", "تكلفة", "كام السعر", "اسعار وتكلفة", "عايز اسعار", "pricing", "price", "cost", "باقات"],
            description: "Customer asks about prices, fees, cost, packages, or اسعار / تكلفة",
          },
          {
            id: "finance",
            label: "finance",
            examples: [...FINANCE_DECISION_EXAMPLES],
            description: "Customer wants to book an appointment / حجز موعد",
          },
          {
            id: "support",
            label: "support",
            examples: ["دعم", "مساعدة", "استفسار عام", "support", "help"],
            description: "Customer needs human support / مساعدة عامة",
          },
          {
            id: "complaints",
            label: "complaints",
            examples: ["شكوى", "شكوي", "مشكلة", "تذكرة", "اعتراض", "complaint"],
            description: "Customer wants to raise or track a complaint / شكوى",
          },
          {
            id: "cancel",
            label: "cancel",
            examples: [
              "عايزه الغي ميعاد",
              "عايزة ألغي الحجز",
              "الغي الموعد",
              "إلغاء الحجز",
              "I want to cancel my appointment",
              "cancel my booking",
            ],
            description: "Customer wants to cancel an existing appointment or booking / إلغاء موعد",
          },
          {
            id: "other",
            label: "other",
            examples: ["مش واضح", "اهلا", "hello"],
            description: "Unclear intent — ask the customer to clarify",
          },
        ],
      },
    },
  },
};

function node(
  id: string,
  type: string,
  config: Record<string, unknown>,
  positionX = 0,
  positionY = 0,
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

function createV20Slice(): WorkflowSnapshot {
  return {
    name: "رحلة كاملة",
    nodes: [
      node(V20_NODE_IDS.decision, "action", structuredClone(V20_DECISION_CONFIG), -1320, -360),
      node(
        V20_NODE_IDS.switch,
        "condition",
        {
          mode: "switch",
          builderType: "switch",
          field: "decision_result.value.label",
          includeDefault: true,
          cases: [
            { id: "support", label: "Support", value: "support" },
            { id: "pricing", label: "Pricing", value: "pricing" },
            { id: "booking", label: "Booking", value: "finance" },
            { id: "complaints", label: "Complaints", value: "complaints" },
            { id: "cancel", label: "Cancel", value: "cancel" },
          ],
        },
        -1260,
        -160,
      ),
      node(V20_NODE_IDS.financePhone, "action", {
        action: "wait_for_input",
        builderType: "ask_question",
        inputKey: "customer_phone",
        prompt: "ما هو رقم هاتفك ؟",
        prompts: { ar: "ما هو رقم هاتفك ؟", en: "What is your mobile number?" },
        question: "ما هو رقم هاتفك ؟",
        questions: { ar: "ما هو رقم هاتفك ؟", en: "What is your mobile number?" },
      }),
      node(V20_NODE_IDS.financeFindCustomer, "action", {
        action: "find_customer",
        builderType: "find_customer",
        lookupBy: "phone",
        value: { mode: "variable", variable: "{{customer_phone}}" },
      }),
      node(V20_NODE_IDS.bookingDates, "action", {
        action: "send_list",
        builderType: "list",
        mode: "lookup",
        lookup: "available_dates",
        title: "اختر تاريخًا متاحًا",
        titles: { ar: "اختر تاريخًا متاحًا", en: "Choose a available date" },
        body: "اختَر الخيار الأنسب لك.",
        filters: {
          days_ahead: "14",
          service_id: "{{selected_service.id}}",
          resource_id: "{{selected_resource.id}}",
        },
        displayField: "display_date",
        valueField: "date",
        outputVariable: "selected_date",
        saveAs: "selected_date",
        inputKey: "selected_date",
      }),
      node(V20_NODE_IDS.bookingSlots, "action", {
        action: "send_list",
        builderType: "list",
        mode: "lookup",
        lookup: "available_slots",
        title: "اختر الوقت المناسب",
        titles: { ar: "اختر الوقت المناسب", en: "Choose a suitable time" },
        body: "اختَر الخيار الأنسب لك.",
        filters: {
          date: "{{selected_date}}",
          service_id: "{{selected_service.id}}",
          resource_id: "{{selected_resource.id}}",
        },
        displayField: "display_time",
        valueField: "start_at",
        outputVariable: "selected_slot",
        saveAs: "selected_slot",
        inputKey: "selected_slot",
      }),
      node(V20_NODE_IDS.createBooking, "action", {
        action: "create_booking",
        builderType: "create_booking",
        customer: { mode: "variable", variable: "customer.id" },
      }),
      node(V20_NODE_IDS.hajaTanya, "action", {
        action: "send_buttons",
        builderType: "buttons",
        body: "تحب تسألي عن حاجة تانية، ولا خلاص؟",
      }),
      node(V20_NODE_IDS.bookingConfirmation, "action", {
        action: "send_message",
        message: "تم تأكيد الحجز بنجاح ✅",
      }),
    ],
    edges: [
      edge("e-decision-switch", V20_NODE_IDS.decision, V20_NODE_IDS.switch),
      edge("e-switch-cancel", V20_NODE_IDS.switch, "fa3e50cc-39e1-4a65-92b6-c5385a0f8ac2", {
        case: "cancel",
        label: "Cancel",
      }),
      edge("e-switch-pricing", V20_NODE_IDS.switch, "c8759051-c3ca-4762-bbfa-19121a31e4c9", {
        case: "pricing",
        label: "Pricing",
      }),
      edge("e-switch-support", V20_NODE_IDS.switch, "d08bebd1-cda3-4d1d-b501-6165858e26b6", {
        case: "support",
        label: "Support",
      }),
      edge("e-switch-finance", V20_NODE_IDS.switch, V20_NODE_IDS.financePhone, {
        case: "finance",
        label: "Booking",
      }),
      edge("e-switch-default", V20_NODE_IDS.switch, "677fab16-47e8-4ed9-a764-156da65336bf", {
        case: "default",
        label: "Default",
      }),
      edge("e-switch-complaints", V20_NODE_IDS.switch, "e78d4136-754e-4b89-ba6d-2173773c32ae", {
        case: "complaints",
        label: "Complaints",
      }),
      edge("e-confirm-haja", V20_NODE_IDS.bookingConfirmation, V20_NODE_IDS.hajaTanya),
      edge("e-dates-slots", V20_NODE_IDS.bookingDates, V20_NODE_IDS.bookingSlots),
      edge("e-slots-create", V20_NODE_IDS.bookingSlots, V20_NODE_IDS.createBooking),
    ],
  };
}

function toGraphRecords(snapshot: WorkflowSnapshot): {
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
} {
  return {
    nodes: snapshot.nodes.map((item) => ({
      id: item.id,
      flow_id: "flow-1",
      type: item.type as AutomationNodeRecord["type"],
      config: item.config,
      position_x: item.positionX,
      position_y: item.positionY,
      created_at: new Date().toISOString(),
    })),
    edges: snapshot.edges.map((item) => ({
      id: item.id,
      flow_id: "flow-1",
      source_node_id: item.sourceNodeId,
      target_node_id: item.targetNodeId,
      condition: item.condition,
      created_at: new Date().toISOString(),
    })),
  };
}

function classify(snapshot: WorkflowSnapshot, text: string): string {
  const outcomes = readDecisionOutcomes(snapshot);
  const decision = snapshot.nodes.find((item) => item.id === V20_NODE_IDS.decision)!;
  const policy = (
    decision.config.aiConfig as {
      metadata: {
        decision: {
          outcomes: typeof outcomes;
          confidencePolicy: {
            minimumConfidence: number;
            fallbackOutcomeId: string;
            retryOnce: boolean;
            requireHumanReview: boolean;
            emitWarning: boolean;
            continueWorkflow: boolean;
          };
          confidenceThreshold: number;
        };
      };
    }
  ).metadata.decision;
  const result = validateDecisionResult(policy.outcomes as never, policy.confidencePolicy, policy.confidenceThreshold, {
    label: text,
    confidence: 1,
  });
  return result.value.label;
}

describe("applyRescheduleBranchToSnapshot", () => {
  it("A/B. Arabic and English reschedule intent maps to reschedule", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    assert.equal(classify(snapshot, "تغيير الموعد"), "reschedule");
    assert.equal(classify(snapshot, "عايزة أغير الموعد"), "reschedule");
    assert.equal(classify(snapshot, "عايزة أغير موعد الحجز"), "reschedule");
    assert.equal(classify(snapshot, "عايز أغير الحجز"), "reschedule");
    assert.equal(classify(snapshot, "أريد تغيير موعدي"), "reschedule");
    assert.equal(classify(snapshot, "إعادة جدولة الموعد"), "reschedule");
    assert.equal(classify(snapshot, "أعد جدولة الحجز"), "reschedule");
    assert.equal(classify(snapshot, "ممكن أغير ميعاد الحجز؟"), "reschedule");
    assert.equal(classify(snapshot, "reschedule"), "reschedule");
    assert.equal(classify(snapshot, "reschedule my appointment"), "reschedule");
    assert.equal(classify(snapshot, "change my appointment"), "reschedule");
    assert.equal(classify(snapshot, "change booking"), "reschedule");
  });

  it("C/D. generic حجز and موعد still route to finance", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const finance = readDecisionOutcomes(snapshot).find((outcome) => outcome.id === "finance");
    assert.deepEqual(finance?.examples, [...FINANCE_DECISION_EXAMPLES]);
    assert.equal(classify(snapshot, "حجز"), "finance");
    assert.equal(classify(snapshot, "موعد"), "finance");
    assert.equal(classify(snapshot, "عايزة أحجز موعد"), "finance");
    assert.equal(classify(snapshot, "عايزة موعد"), "finance");
    assert.equal(classify(snapshot, "احجز"), "finance");
    assert.equal(classify(snapshot, "book"), "finance");
  });

  it("does not steal cancel examples", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    assert.equal(classify(snapshot, "الغي الموعد"), "cancel");
    assert.equal(classify(snapshot, "cancel my booking"), "cancel");
  });

  it("adds only an additive switch case and keeps existing cases/edges", () => {
    const original = createV20Slice();
    const originalEdgeIds = original.edges.map((item) => item.id);
    const { snapshot } = applyRescheduleBranchToSnapshot(original);
    const switchNode = snapshot.nodes.find((item) => item.id === V20_NODE_IDS.switch)!;
    const cases = switchNode.config.cases as Array<{ value: string }>;
    assert.deepEqual(
      cases.map((item) => item.value),
      ["support", "pricing", "finance", "reschedule", "complaints", "cancel"],
    );

    for (const id of originalEdgeIds) {
      const before = original.edges.find((item) => item.id === id)!;
      const after = snapshot.edges.find((item) => item.id === id)!;
      assert.deepEqual(after, before);
    }

    const rescheduleEdge = snapshot.edges.find((item) => item.id === RESCHEDULE_EDGE_IDS.switchToPhone);
    assert.equal(rescheduleEdge?.sourceNodeId, V20_NODE_IDS.switch);
    assert.equal(rescheduleEdge?.targetNodeId, RESCHEDULE_NODE_IDS.phone);
    assert.equal(rescheduleEdge?.condition.case, "reschedule");
  });

  it("V. existing finance/cancel/support/pricing/booking nodes stay untouched", () => {
    const original = createV20Slice();
    const { snapshot } = applyRescheduleBranchToSnapshot(original);
    for (const id of [
      V20_NODE_IDS.financePhone,
      V20_NODE_IDS.financeFindCustomer,
      V20_NODE_IDS.bookingDates,
      V20_NODE_IDS.bookingSlots,
      V20_NODE_IDS.createBooking,
      V20_NODE_IDS.hajaTanya,
      V20_NODE_IDS.bookingConfirmation,
    ]) {
      const before = original.nodes.find((item) => item.id === id)!;
      const after = snapshot.nodes.find((item) => item.id === id)!;
      assert.deepEqual(after.config, before.config);
      assert.equal(after.positionX, before.positionX);
      assert.equal(after.positionY, before.positionY);
    }
  });

  it("identity uses customer_phone → find_customer, not whatsapp_sender_phone", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const phone = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.phone)!;
    const find = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.findCustomer)!;
    assert.equal(phone.config.inputKey, "customer_phone");
    assert.equal(find.config.lookupBy, "phone");
    assert.deepEqual(find.config.value, { mode: "variable", variable: "{{customer_phone}}" });
    assert.equal(JSON.stringify(snapshot).includes("whatsapp_sender_phone"), false);
  });

  it("E/F/G/J. bookings list writes selected_booking from customer_scheduling_bookings", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const list = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.bookingsList)!;
    assert.equal(list.config.lookup, "customer_scheduling_bookings");
    assert.equal(list.config.outputVariable, "selected_booking");
    assert.equal(list.config.saveAs, "selected_booking");
    assert.deepEqual(list.config.filters, { customer_id: "{{customer.id}}" });
    assert.equal(list.config.displayField, "display_label");
    assert.equal(list.config.valueField, "id");
    assert.notEqual(list.config.outputVariable, "booking");
  });

  it("G. empty bookings go to حاجة تانية and never to create_booking", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const empty = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.emptyBookings)!;
    assert.equal(empty.config.message, EMPTY_BOOKINGS_MESSAGE_AR);
    const emptyEdge = snapshot.edges.find((item) => item.sourceNodeId === RESCHEDULE_NODE_IDS.emptyBookings);
    assert.equal(emptyEdge?.targetNodeId, V20_NODE_IDS.hajaTanya);
    const createIncoming = snapshot.edges.filter((item) => item.targetNodeId === V20_NODE_IDS.createBooking);
    assert.equal(
      createIncoming.some((item) =>
        Object.values(RESCHEDULE_NODE_IDS).includes(item.sourceNodeId as (typeof RESCHEDULE_NODE_IDS)[keyof typeof RESCHEDULE_NODE_IDS]),
      ),
      false,
    );
  });

  it("K/L. new date/slot nodes bind selected_booking.service_id and resource_id", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const dates = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.dates)!;
    const slots = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.slots)!;
    const originalDates = createV20Slice().nodes.find((item) => item.id === V20_NODE_IDS.bookingDates)!;
    assert.notEqual(dates.id, V20_NODE_IDS.bookingDates);
    assert.notEqual(slots.id, V20_NODE_IDS.bookingSlots);
    assert.deepEqual(dates.config.filters, {
      days_ahead: "14",
      service_id: "{{selected_booking.service_id}}",
      resource_id: "{{selected_booking.resource_id}}",
    });
    assert.deepEqual(slots.config.filters, {
      date: "{{selected_date}}",
      service_id: "{{selected_booking.service_id}}",
      resource_id: "{{selected_booking.resource_id}}",
    });
    assert.deepEqual(originalDates.config.filters, {
      days_ahead: "14",
      service_id: "{{selected_service.id}}",
      resource_id: "{{selected_resource.id}}",
    });
  });

  it("M. reschedule_booking binds selected_booking.id, not booking.id", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const action = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.action)!;
    const normalized = normalizeRescheduleBookingConfig(action.config);
    assert.equal(readBindingString(normalized.bookingId), "{{selected_booking.id}}");
    assert.equal(readBindingString(normalized.date), "{{selected_date}}");
    assert.equal(readBindingString(normalized.slotStart), "{{selected_slot.start_at}}");
    assert.notEqual(readBindingString(normalized.bookingId), "{{booking.id}}");
    assert.notEqual(readBindingString(normalized.bookingId), "booking.id");
  });

  it("N/O. date and slot lists resume into selected_date / selected_slot", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const dates = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.dates)!;
    const slots = snapshot.nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.slots)!;
    assert.equal(dates.config.outputVariable, "selected_date");
    assert.equal(slots.config.outputVariable, "selected_slot");
    assert.equal(dates.config.lookup, "available_dates");
    assert.equal(slots.config.lookup, "available_slots");
  });

  it("P. Instagram list titles stay within the quick-reply limit", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    for (const id of [RESCHEDULE_NODE_IDS.bookingsList, RESCHEDULE_NODE_IDS.dates, RESCHEDULE_NODE_IDS.slots]) {
      const list = snapshot.nodes.find((item) => item.id === id)!;
      const title = String(list.config.title ?? "");
      const ar = String((list.config.titles as { ar?: string } | undefined)?.ar ?? title);
      const en = String((list.config.titles as { en?: string } | undefined)?.en ?? "");
      assert.ok(title.length <= INSTAGRAM_TITLE_MAX, `${id} title too long: ${title}`);
      assert.ok(ar.length <= INSTAGRAM_TITLE_MAX, `${id} ar title too long: ${ar}`);
      assert.ok(en.length <= INSTAGRAM_TITLE_MAX, `${id} en title too long: ${en}`);
    }
  });

  it("routes switch(reschedule) into the new branch and success/failure back to حاجة تانية", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const { nodes, edges } = toGraphRecords(snapshot);
    const switchNode = nodes.find((item) => item.id === V20_NODE_IDS.switch)!;
    assert.equal(resolveNextNodeId(switchNode, { edges }, { __switchCase: "reschedule" }), RESCHEDULE_NODE_IDS.phone);
    assert.equal(resolveNextNodeId(switchNode, { edges }, { __switchCase: "finance" }), V20_NODE_IDS.financePhone);
    assert.equal(resolveNextNodeId(switchNode, { edges }, { __switchCase: "cancel" }), "fa3e50cc-39e1-4a65-92b6-c5385a0f8ac2");
    assert.equal(resolveNextNodeId(switchNode, { edges }, { __switchCase: "pricing" }), "c8759051-c3ca-4762-bbfa-19121a31e4c9");
    assert.equal(resolveNextNodeId(switchNode, { edges }, { __switchCase: "support" }), "d08bebd1-cda3-4d1d-b501-6165858e26b6");

    const ifBooking = nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.ifSelectedBooking)!;
    assert.equal(resolveNextNodeId(ifBooking, { edges }, { __branch: "yes" }), RESCHEDULE_NODE_IDS.dates);
    assert.equal(resolveNextNodeId(ifBooking, { edges }, { __branch: "no" }), RESCHEDULE_NODE_IDS.emptyBookings);

    const ifSuccess = nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.ifSuccess)!;
    assert.equal(resolveNextNodeId(ifSuccess, { edges }, { __branch: "yes" }), RESCHEDULE_NODE_IDS.confirmation);
    assert.equal(resolveNextNodeId(ifSuccess, { edges }, { __branch: "no" }), RESCHEDULE_NODE_IDS.failure);

    const confirmation = nodes.find((item) => item.id === RESCHEDULE_NODE_IDS.confirmation)!;
    assert.equal(resolveNextNodeId(confirmation, { edges }, {}), V20_NODE_IDS.hajaTanya);
  });

  it("empty selected_booking and reschedule.success drive the If nodes", () => {
    const emptyBooking = evaluateIfElseCondition(
      {
        root: {
          id: "root",
          combinator: "and",
          rules: [{ id: "rule-1", field: "selected_booking.id", operator: "is_not_empty" }],
        },
      },
      { variables: {} },
    );
    const presentBooking = evaluateIfElseCondition(
      {
        root: {
          id: "root",
          combinator: "and",
          rules: [{ id: "rule-1", field: "selected_booking.id", operator: "is_not_empty" }],
        },
      },
      { variables: { selected_booking: { id: "booking-1", service_id: "svc", resource_id: "res" } } },
    );
    assert.equal(emptyBooking, "no");
    assert.equal(presentBooking, "yes");

    const success = evaluateIfElseCondition(
      {
        root: {
          id: "root",
          combinator: "and",
          rules: [{ id: "rule-1", field: "reschedule.success", operator: "boolean_true" }],
        },
      },
      { variables: { reschedule: { success: true } } },
    );
    const failure = evaluateIfElseCondition(
      {
        root: {
          id: "root",
          combinator: "and",
          rules: [{ id: "rule-1", field: "reschedule.success", operator: "boolean_true" }],
        },
      },
      { variables: { reschedule: { success: false, errors: ["slot_unavailable"] } } },
    );
    assert.equal(success, "yes");
    assert.equal(failure, "no");
  });

  it("U. confirmation interpolates new booking / selected_booking values", () => {
    const text = interpolateTemplateString(RESCHEDULE_CONFIRMATION_MESSAGE_AR, {
      selected_booking: { service_name: "كشف", resource_name: "د. أماني" },
      selected_date: { display_date: "الأحد 21 سبتمبر" },
      selected_slot: { display_time: "5:15 م" },
      booking: { confirmation_number: "BK-000042", start_at: "2026-09-21T15:15:00.000Z" },
    });
    assert.match(text, /تم تغيير الموعد بنجاح/);
    assert.match(text, /كشف/);
    assert.match(text, /د\. أماني/);
    assert.match(text, /الأحد 21 سبتمبر/);
    assert.match(text, /5:15 م/);
    assert.match(text, /BK-000042/);
  });

  it("switch label reschedule maps to the reschedule case value", () => {
    const { snapshot } = applyRescheduleBranchToSnapshot(createV20Slice());
    const switchNode = snapshot.nodes.find((item) => item.id === V20_NODE_IDS.switch)!;
    const routed = evaluateSwitchCase(
      {
        mode: "switch",
        field: "decision_result.value.label",
        cases: switchNode.config.cases as never,
        includeDefault: true,
      },
      { variables: { decision_result: { value: { label: "reschedule" } } } },
    );
    assert.equal(routed, "reschedule");
    const finance = evaluateSwitchCase(
      {
        mode: "switch",
        field: "decision_result.value.label",
        cases: switchNode.config.cases as never,
        includeDefault: true,
      },
      { variables: { decision_result: { value: { label: "finance" } } } },
    );
    assert.equal(finance, "finance");
  });

  it("is idempotent and does not duplicate nodes or edges", () => {
    const first = applyRescheduleBranchToSnapshot(createV20Slice());
    const second = applyRescheduleBranchToSnapshot(first.snapshot);
    assert.equal(second.snapshot.nodes.length, first.snapshot.nodes.length);
    assert.equal(second.snapshot.edges.length, first.snapshot.edges.length);
    assert.equal(second.addedNodeIds.length, 0);
    assert.equal(second.addedEdgeIds.length, 0);
  });

  it("keeps reschedule examples free of generic موعد/حجز tokens", () => {
    for (const example of RESCHEDULE_DECISION_EXAMPLES) {
      assert.notEqual(example, "موعد");
      assert.notEqual(example, "حجز");
    }
  });
});
