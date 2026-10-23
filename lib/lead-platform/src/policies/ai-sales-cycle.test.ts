import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEAD_PERMISSIONS } from "../constants.js";
import { LeadNotFoundError, LeadPermissionDeniedError, LeadStageTransitionError } from "../errors.js";
import {
  createNoopLeadAssigneeResolverPort,
  createNoopLeadAuditPort,
  createNoopLeadConversionPort,
  createNoopLeadNotificationPort,
} from "../ports/noop-ports.js";
import type { LeadRepository } from "../repositories/lead-repository-port.js";
import { LeadCommandService } from "../services/lead-command-service.js";
import type { LeadLifecycleStatus, LeadRecord, LeadServiceContext, LeadStageRecord } from "../types/lead-types.js";
import { extractSalesEvidenceFromConversation } from "./conversation-sales-evidence.js";
import { isStageTransitionAllowed } from "../validators/stage-transition-validator.js";

const PIPELINE_ID = "pipe-1";

function stage(id: string, lifecycleStatus: LeadLifecycleStatus, companyId = "company-1"): LeadStageRecord {
  return {
    id,
    companyId,
    pipelineId: PIPELINE_ID,
    name: lifecycleStatus,
    slug: lifecycleStatus,
    lifecycleStatus,
    sortOrder: 0,
    probabilityPercent: 10,
    isTerminal: lifecycleStatus === "won" || lifecycleStatus === "lost",
  };
}

const STAGES = [
  stage("stage-new", "new"),
  stage("stage-qualified", "qualified"),
  stage("stage-contacted", "contacted"),
  stage("stage-demo", "demo_scheduled"),
  stage("stage-demo-done", "demo_completed"),
  stage("stage-proposal", "proposal_sent"),
  stage("stage-won", "won"),
];

function baseLead(overrides?: Partial<LeadRecord>): LeadRecord {
  return {
    id: "lead-1",
    companyId: "company-1",
    pipelineId: PIPELINE_ID,
    stageId: "stage-new",
    sourceId: null,
    lifecycleStatus: "new",
    title: "Synthetic lead",
    contactName: "Sam",
    email: "sam@example.com",
    phone: "+201000000001",
    companyName: null,
    priority: "normal",
    estimatedValue: 0,
    currency: "EGP",
    score: 0,
    isQualified: false,
    isVip: false,
    language: null,
    territory: null,
    department: null,
    assignedUserId: null,
    customerId: null,
    conversationId: "conv-1",
    qualifiedAt: null,
    convertedAt: null,
    archivedAt: null,
    expectedCloseDate: null,
    temperature: null,
    notes: "",
    tags: [],
    lastActivityAt: new Date().toISOString(),
    aiSummary: "",
    metadata: {},
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function harness(
  initial?: Partial<LeadRecord>,
  saleCompletion?: { hasAcceptedQuoteForLead(input: { companyId: string; leadId: string }): Promise<boolean> },
) {
  const leads = new Map<string, LeadRecord>([["lead-1", baseLead(initial)]]);
  const events: string[] = [];
  const activities: Array<{ activityType: string; payload?: Record<string, unknown> }> = [];
  const history: string[] = [];
  const repo = {
    async getLead(companyId: string, id: string) {
      const lead = leads.get(id);
      if (!lead || lead.companyId !== companyId) return null;
      return lead;
    },
    async updateLead(input: { leadId: string; companyId: string } & Partial<LeadRecord>) {
      const existing = leads.get(input.leadId);
      if (!existing || existing.companyId !== input.companyId) throw new Error("missing lead");
      const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
      leads.set(input.leadId, updated);
      return updated;
    },
    async getStage(companyId: string, id: string) {
      return STAGES.find((item) => item.id === id && item.companyId === companyId) ?? null;
    },
    async getPipeline() {
      return {
        id: PIPELINE_ID,
        companyId: "company-1",
        name: "Default",
        slug: "default",
        description: "",
        isDefault: true,
        isActive: true,
        allowBackwardStageMovement: true,
      };
    },
    async listStages() {
      return STAGES;
    },
    async appendActivity(input: { activityType: string; payload?: Record<string, unknown> }) {
      activities.push({ activityType: input.activityType, payload: input.payload });
      return { id: "activity", ...input, createdAt: new Date().toISOString() };
    },
    async appendHistory(input: { fieldName: string }) {
      history.push(input.fieldName);
      return { id: "history", ...input, createdAt: new Date().toISOString() };
    },
  } as unknown as LeadRepository;

  const service = new LeadCommandService({
    leads: repo,
    assignees: createNoopLeadAssigneeResolverPort(),
    conversion: createNoopLeadConversionPort(),
    events: { async publish(event) { events.push(event.type); } },
    notifications: createNoopLeadNotificationPort(),
    audit: createNoopLeadAuditPort(),
    saleCompletion,
  });

  const ctx: LeadServiceContext = {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === LEAD_PERMISSIONS.view ||
      code === LEAD_PERMISSIONS.edit ||
      code === LEAD_PERMISSIONS.qualify,
  };

  return { service, ctx, events, activities, history, leads };
}

describe("conversation sales evidence", () => {
  it("does not treat a product question as buying intent", () => {
    const evidence = extractSalesEvidenceFromConversation(["ما سعر Aurora Studio؟"]);
    assert.equal(evidence.productInterest, true);
    assert.equal(evidence.explicitBuyingIntent, undefined);
    const arabicPrice = extractSalesEvidenceFromConversation(["كم سعر المنتج ده؟"]);
    assert.equal(arabicPrice.explicitBuyingIntent, undefined);
    const interest = extractSalesEvidenceFromConversation(["أنا مهتم بالمنتج بشكل عام"]);
    assert.equal(interest.explicitBuyingIntent, undefined);
  });

  it("reads buying intent, product, contact, and budget from the conversation", () => {
    const evidence = extractSalesEvidenceFromConversation([
      "I want to buy Aurora Studio. Email buyer@example.com. Budget 2000 EGP.",
    ]);
    assert.equal(evidence.explicitBuyingIntent, true);
    assert.equal(evidence.productInterest, true);
    assert.equal(evidence.contactAvailable, true);
    assert.equal(evidence.budgetKnown, true);
  });
});

describe("AI sales cycle", () => {
  it("does not qualify a product-only question", async () => {
    const { service, ctx, events, leads } = harness();
    const result = await service.applyConversationQualification(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      messageId: "msg-product",
      texts: ["ما سعر Aurora Studio؟"],
    });
    assert.equal(result.qualificationApplied, false);
    assert.equal(result.outcome, "interested_not_qualified");
    assert.equal(leads.get("lead-1")?.lifecycleStatus, "new");
    assert.equal(events.length, 0);
  });

  it("uses the same qualification decision in Arabic, English, and German", async () => {
    const priceOnly = [
      "ما سعر Aurora Studio؟",
      "What is the price of Aurora Studio?",
      "Was kostet Aurora Studio?",
    ];
    for (const text of priceOnly) {
      const { service, ctx, events, leads } = harness();
      const result = await service.applyConversationQualification(ctx, {
        companyId: "company-1",
        leadId: "lead-1",
        messageId: `price-${text.slice(0, 8)}`,
        texts: [text],
      });
      assert.equal(result.qualificationApplied, false);
      assert.equal(result.outcome, "interested_not_qualified");
      assert.equal(leads.get("lead-1")?.lifecycleStatus, "new");
      assert.equal(events.length, 0);
    }

    const buying = [
      "عايز أشتري Aurora Studio. الإيميل buyer@example.com",
      "I want to buy Aurora Studio. My email is buyer@example.com.",
      "Ich möchte Aurora Studio kaufen. Meine E-Mail ist buyer@example.com.",
    ];
    for (const text of buying) {
      const { service, ctx, leads } = harness();
      const result = await service.applyConversationQualification(ctx, {
        companyId: "company-1",
        leadId: "lead-1",
        messageId: `buy-${text.slice(0, 8)}`,
        texts: [text],
      });
      assert.equal(result.qualificationApplied, true, text);
      assert.equal(leads.get("lead-1")?.lifecycleStatus, "qualified");
    }

    const notYet = harness();
    const held = await notYet.service.applyConversationQualification(notYet.ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      messageId: "de-interest",
      texts: ["Ich interessiere mich für Aurora Studio, aber ich möchte noch nicht kaufen."],
    });
    assert.equal(held.qualificationApplied, false);
    assert.equal(held.outcome, "interested_not_qualified");
  });

  it("qualifies a complete buying conversation once", async () => {
    const { service, ctx, events, activities, leads } = harness();
    const texts = ["I want to buy Aurora Studio. My email is buyer@example.com."];
    const first = await service.applyConversationQualification(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      messageId: "msg-buy",
      texts,
    });
    const second = await service.applyConversationQualification(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      messageId: "msg-buy",
      texts,
    });
    assert.equal(first.qualificationApplied, true);
    assert.equal(first.outcome, "qualified");
    assert.equal(second.duplicate, true);
    assert.equal(second.qualificationApplied, false);
    assert.equal(second.reason, "message_already_processed");
    assert.equal(leads.get("lead-1")?.lifecycleStatus, "qualified");
    assert.equal(events.filter((event) => event === "lead_qualified").length, 1);
    const audit = activities.find((item) => item.activityType === "lead_qualified");
    assert.equal(audit?.payload?.source, "ai");
    assert.equal(audit?.payload?.previousLifecycle, "new");
    assert.equal(audit?.payload?.newLifecycle, "qualified");
    assert.equal((audit?.payload?.evidence as { explicitBuyingIntent?: boolean }).explicitBuyingIntent, true);
    assert.equal(JSON.stringify(audit?.payload).includes("buyer@example.com"), false);
  });

  it("moves a confirmed demo booking to demo_scheduled and not a failed booking", () => {
    assert.equal(isStageTransitionAllowed("new", "contacted", { source: "system" }), true);
    assert.equal(isStageTransitionAllowed("contacted", "demo_scheduled", { source: "system" }), true);
    assert.equal(isStageTransitionAllowed("qualified", "demo_scheduled", { source: "system" }), true);
    assert.equal(isStageTransitionAllowed("demo_scheduled", "proposal_sent", { source: "system" }), false);
  });

  it("allows demo completion only from demo_scheduled and quote send only on an allowed edge", () => {
    assert.equal(isStageTransitionAllowed("demo_scheduled", "demo_completed", { source: "human" }), true);
    assert.equal(isStageTransitionAllowed("new", "demo_completed", { source: "human" }), false);
    assert.equal(isStageTransitionAllowed("demo_completed", "proposal_sent", { source: "system" }), true);
    assert.equal(isStageTransitionAllowed("qualified", "proposal_sent", { source: "system" }), false);
  });

  it("rejects won without an accepted quote, including a permitted human drag", async () => {
    const blocked = harness({ lifecycleStatus: "proposal_sent", stageId: "stage-proposal" });
    await assert.rejects(
      () =>
        blocked.service.changeLeadStage(blocked.ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          stageId: "stage-won",
          stageAudit: { source: "human", reason: "drag" },
        }),
      (error: unknown) => error instanceof LeadStageTransitionError && error.reason === "sale_completion_required",
    );

    const allowed = harness({ lifecycleStatus: "proposal_sent", stageId: "stage-proposal" }, {
      async hasAcceptedQuoteForLead() {
        return true;
      },
    });
    const moved = await allowed.service.changeLeadStage(allowed.ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      stageId: "stage-won",
      stageAudit: { source: "human", reason: "accepted_quote" },
    });
    assert.equal(moved.lead.lifecycleStatus, "won");
    assert.equal(allowed.activities.at(-1)?.payload?.reason, "accepted_quote");
  });

  it("rejects an AI move to won and a human jump that is not on the graph", async () => {
    const { service, ctx } = harness({ lifecycleStatus: "proposal_sent", stageId: "stage-proposal" }, {
      async hasAcceptedQuoteForLead() {
        return true;
      },
    });
    await assert.rejects(
      () =>
        service.changeLeadStage(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          stageId: "stage-won",
          stageAudit: { source: "ai", reason: "model_said_won" },
        }),
      (error: unknown) => error instanceof LeadStageTransitionError && error.reason === "won_lost_requires_human",
    );
    await assert.rejects(
      () =>
        service.changeLeadStage(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          stageId: "stage-new",
          stageAudit: { source: "human", reason: "drag" },
        }),
      LeadStageTransitionError,
    );
  });

  it("rejects a stage change without permission and hides another company's lead", async () => {
    const { service, ctx, leads } = harness();
    const denied: LeadServiceContext = { ...ctx, hasPermission: () => false };
    await assert.rejects(
      () => service.changeLeadStage(denied, { companyId: "company-1", leadId: "lead-1", stageId: "stage-contacted" }),
      LeadPermissionDeniedError,
    );
    await assert.rejects(
      () =>
        service.applyConversationQualification(
          { ...ctx, companyId: "company-2" },
          { companyId: "company-1", leadId: "lead-1", messageId: "msg", texts: ["I want to buy the product"] },
        ),
      /company/i,
    );
    leads.set("lead-2", baseLead({ id: "lead-2", companyId: "company-2" }));
    await assert.rejects(
      () =>
        service.applyConversationQualification(ctx, {
          companyId: "company-1",
          leadId: "lead-2",
          messageId: "msg",
          texts: ["I want to buy the product"],
        }),
      LeadNotFoundError,
    );
  });

  it("does not record another stage event when the same stage is saved again", async () => {
    const { service, ctx, events, history } = harness({
      lifecycleStatus: "demo_scheduled",
      stageId: "stage-demo",
    });
    await service.changeLeadStage(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      stageId: "stage-demo",
      stageAudit: { source: "system", reason: "demo_booking_confirmed" },
    });
    assert.equal(events.length, 0);
    assert.equal(history.length, 0);
  });

  it("records a human one-step reverse and a confirmed quote-send edge", async () => {
    const { service, ctx, activities, leads } = harness({
      lifecycleStatus: "proposal_sent",
      stageId: "stage-proposal",
    });
    await service.changeLeadStage(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      stageId: "stage-contacted",
      stageAudit: { source: "human", reason: "manual_reverse" },
    });
    assert.equal(leads.get("lead-1")?.lifecycleStatus, "contacted");
    assert.equal(activities.at(-1)?.payload?.source, "human");
    assert.equal(activities.at(-1)?.payload?.reason, "manual_reverse");

    leads.set("lead-1", baseLead({ lifecycleStatus: "demo_completed", stageId: "stage-demo-done" }));
    await service.changeLeadStage(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      stageId: "stage-proposal",
      stageAudit: { source: "system", reason: "confirmed_quote_send" },
    });
    assert.equal(leads.get("lead-1")?.lifecycleStatus, "proposal_sent");
    assert.equal(activities.at(-1)?.payload?.source, "system");
    assert.equal(activities.at(-1)?.payload?.previousLifecycle, "demo_completed");
  });
});
