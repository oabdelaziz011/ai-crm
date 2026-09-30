import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LeadCommandService } from "../services/lead-command-service.js";
import { LeadConflictError } from "../errors.js";
import type { LeadRepository } from "../repositories/lead-repository-port.js";
import type { LeadRecord } from "../types/lead-types.js";
import type { LeadDomainEvent } from "../events/lead-event-factory.js";
import type {
  LeadConversionPort,
  LeadOpportunityConversionPort,
} from "../ports/lead-platform-ports.js";

const COMPANY = "company-1";
const LEAD = "lead-1";

function baseLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  const now = new Date().toISOString();
  return {
    id: LEAD,
    companyId: COMPANY,
    pipelineId: "pipe-1",
    stageId: "stage-new",
    sourceId: null,
    lifecycleStatus: "qualified",
    title: "Acme deal",
    contactName: "Jane",
    email: "jane@example.com",
    phone: null,
    companyName: "Acme",
    priority: "normal",
    estimatedValue: 5000,
    currency: "EGP",
    score: 60,
    isQualified: true,
    isVip: false,
    language: null,
    territory: null,
    department: null,
    assignedUserId: "owner-1",
    customerId: null,
    conversationId: null,
    qualifiedAt: now,
    convertedAt: null,
    archivedAt: null,
    expectedCloseDate: null,
    temperature: null,
    notes: "",
    tags: [],
    lastActivityAt: now,
    aiSummary: "",
    metadata: {},
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as LeadRecord;
}

type Harness = ReturnType<typeof createHarness>;

function createHarness(options: {
  lead?: Partial<LeadRecord>;
  customerCreated?: boolean;
  existingOpportunityId?: string | null;
  opportunityFailures?: number;
  customerDelayMs?: number;
  withClaims?: boolean;
} = {}) {
  const leads = new Map<string, LeadRecord>([[LEAD, baseLead(options.lead)]]);
  const activities: Array<{ activityType: string; summary: string; payload?: Record<string, unknown> }> = [];
  const conversions: Array<{ customerId: string; opportunityId?: string | null }> = [];
  const events: LeadDomainEvent[] = [];
  let claim: string | null = null;
  let customerCalls = 0;
  let ensureCalls = 0;
  let opportunityFailuresLeft = options.opportunityFailures ?? 0;
  let opportunityId: string | null = options.existingOpportunityId ?? null;
  const releases: string[] = [];

  const repo = {
    getLead: async (companyId: string, leadId: string) => {
      const lead = leads.get(leadId);
      return lead && lead.companyId === companyId ? lead : null;
    },
    listTags: async () => [],
    listNotes: async () => [],
    listStages: async () => [
      {
        id: "stage-converted",
        companyId: COMPANY,
        pipelineId: "pipe-1",
        name: "Converted",
        slug: "converted",
        lifecycleStatus: "converted",
        sortOrder: 9,
        probabilityPercent: 100,
        isTerminal: true,
      },
    ],
    updateLead: async (input: Partial<LeadRecord> & { leadId: string }) => {
      const current = leads.get(input.leadId)!;
      const next = { ...current, ...input, id: current.id } as LeadRecord;
      leads.set(input.leadId, next);
      return next;
    },
    recordConversion: async (input: { customerId: string; opportunityId?: string | null }) => {
      conversions.push({ customerId: input.customerId, opportunityId: input.opportunityId });
    },
    appendActivity: async (input: { activityType: string; summary: string; payload?: Record<string, unknown> }) => {
      activities.push(input);
      return { id: `act-${activities.length}` };
    },
    ...(options.withClaims === false
      ? {}
      : {
          tryClaimConversion: async (input: { claimId: string }) => {
            if (claim && claim !== input.claimId) return false;
            claim = input.claimId;
            return true;
          },
          releaseConversionClaim: async (input: { claimId: string }) => {
            releases.push(input.claimId);
            if (claim === input.claimId) claim = null;
          },
        }),
  } as unknown as LeadRepository;

  const conversion: LeadConversionPort = {
    async convertLead(input) {
      customerCalls += 1;
      if (options.customerDelayMs) await new Promise((r) => setTimeout(r, options.customerDelayMs));
      const current = leads.get(input.leadId)!;
      // The real adapter links the lead to the resolved customer before returning.
      leads.set(input.leadId, { ...current, customerId: "cust-1", isQualified: true });
      return { customerId: "cust-1", opportunityId: null, customerCreated: options.customerCreated ?? true };
    },
  };

  const ensureInputs: Array<{ companyId: string; leadId: string; companyDefaultCurrency?: string }> = [];
  const opportunityConversion: LeadOpportunityConversionPort = {
    async findOpportunityForLead() {
      return opportunityId ? { opportunityId } : null;
    },
    async assertCanCreateForLead() {},
    async ensureOpportunityForLead(_ctx, input) {
      ensureCalls += 1;
      ensureInputs.push(input);
      if (opportunityFailuresLeft > 0) {
        opportunityFailuresLeft -= 1;
        throw new Error("Opportunity service unavailable");
      }
      if (opportunityId) return { opportunityId, created: false };
      opportunityId = "opp-1";
      return { opportunityId, created: true };
    },
  };

  const service = new LeadCommandService({
    leads: repo,
    assignees: {
      resolveAssigneeLabel: async (id) => id,
      loadAssigneeLabels: async (ids) => new Map(ids.map((id) => [id, id])),
      listAssigneeCandidates: async () => [],
    },
    conversion,
    opportunityConversion,
    events: { publish: async (event) => void events.push(event) },
    notifications: { notify: async () => {} },
    audit: { write: async () => {} },
  });

  return {
    service,
    leads,
    activities,
    conversions,
    events,
    ensureInputs,
    releases,
    get claim() {
      return claim;
    },
    get customerCalls() {
      return customerCalls;
    },
    get ensureCalls() {
      return ensureCalls;
    },
  };
}

const ctx = {
  userId: "user-1",
  companyId: COMPANY,
  isSuperAdmin: false,
  hasPermission: () => true,
};

const convertWithOpportunity = (h: Harness, context = ctx) =>
  h.service.convertLead(context, {
    companyId: COMPANY,
    leadId: LEAD,
    mode: "customer_and_opportunity",
    companyDefaultCurrency: "EGP",
  });

describe("LeadCommandService.convertLead — Customer + Opportunity", () => {
  it("creates the customer and the opportunity and marks the lead converted", async () => {
    const h = createHarness();
    const result = await convertWithOpportunity(h);
    assert.equal(result.customerId, "cust-1");
    assert.equal(result.opportunityId, "opp-1");
    assert.equal(result.customerCreated, true);
    assert.equal(result.opportunityCreated, true);
    assert.equal(result.lead.lifecycleStatus, "converted");
    assert.equal(result.lead.stageId, "stage-converted");
  });

  it("links the opportunity to the lead and customer through the existing relationships", async () => {
    const h = createHarness();
    await convertWithOpportunity(h);
    assert.deepEqual(h.ensureInputs[0], { companyId: COMPANY, leadId: LEAD, companyDefaultCurrency: "EGP" });
    assert.equal(h.leads.get(LEAD)!.customerId, "cust-1");
    assert.deepEqual(h.conversions, [{ customerId: "cust-1", opportunityId: "opp-1" }]);
  });

  it("reuses an existing customer and an existing lead opportunity", async () => {
    const h = createHarness({ customerCreated: false, existingOpportunityId: "opp-existing" });
    const result = await convertWithOpportunity(h);
    assert.equal(result.customerCreated, false);
    assert.equal(result.opportunityId, "opp-existing");
    assert.equal(result.opportunityCreated, false);
    assert.equal(h.activities[0]!.payload!.customerOutcome, "reused");
    assert.equal(h.activities[0]!.payload!.opportunityOutcome, "reused");
  });

  it("is idempotent on repeat: no second customer, no second opportunity, no new activity", async () => {
    const h = createHarness();
    const first = await convertWithOpportunity(h);
    const second = await convertWithOpportunity(h);
    assert.equal(second.alreadyConverted, true);
    assert.equal(second.customerId, first.customerId);
    assert.equal(second.opportunityId, first.opportunityId);
    assert.equal(h.customerCalls, 1);
    assert.equal(h.ensureCalls, 1);
    assert.equal(h.activities.length, 1);
    assert.equal(h.events.length, 1);
  });

  it("prevents a repeated opportunity when a retry resumes a partial conversion", async () => {
    const h = createHarness({ lead: { customerId: "cust-1" }, existingOpportunityId: "opp-1" });
    const result = await convertWithOpportunity(h);
    assert.equal(h.customerCalls, 0, "linked customer is resumed, not recreated");
    assert.equal(result.opportunityId, "opp-1");
    assert.equal(result.opportunityCreated, false);
  });

  it("blocks a concurrent double-click with the server-side claim", async () => {
    const h = createHarness({ customerDelayMs: 30 });
    const [a, b] = await Promise.allSettled([convertWithOpportunity(h), convertWithOpportunity(h)]);
    const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
    const rejected = [a, b].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]!.reason instanceof LeadConflictError);
    assert.equal(h.customerCalls, 1);
    assert.equal(h.ensureCalls, 1);
    assert.equal(h.claim, null, "claim released after completion");
  });

  it("partial failure leaves the lead unconverted and resumable; retry completes without duplicates", async () => {
    const h = createHarness({ opportunityFailures: 1 });
    await assert.rejects(() => convertWithOpportunity(h), /Opportunity service unavailable/);
    const afterFailure = h.leads.get(LEAD)!;
    assert.notEqual(afterFailure.lifecycleStatus, "converted");
    assert.equal(afterFailure.customerId, "cust-1");
    assert.equal(h.claim, null, "claim released on failure");
    assert.equal(h.activities.length, 0);

    const retry = await convertWithOpportunity(h);
    assert.equal(retry.lead.lifecycleStatus, "converted");
    assert.equal(retry.opportunityId, "opp-1");
    assert.equal(h.customerCalls, 1, "customer is not recreated on retry");
  });

  it("rejects users without leads.convert or opportunities.convert before any write", async () => {
    const noConvert = createHarness();
    await assert.rejects(
      () => convertWithOpportunity(noConvert, { ...ctx, hasPermission: (code) => code !== "leads.convert" }),
      /permission/i,
    );
    const noOpportunity = createHarness();
    await assert.rejects(
      () =>
        convertWithOpportunity(noOpportunity, {
          ...ctx,
          hasPermission: (code) => code !== "opportunities.convert",
        }),
      /permission/i,
    );
    for (const h of [noConvert, noOpportunity]) {
      assert.equal(h.customerCalls, 0);
      assert.equal(h.ensureCalls, 0);
      assert.equal(h.leads.get(LEAD)!.lifecycleStatus, "qualified");
    }
  });

  it("rejects cross-company conversion", async () => {
    const h = createHarness();
    await assert.rejects(() =>
      h.service.convertLead(
        { ...ctx, companyId: "company-2" },
        { companyId: COMPANY, leadId: LEAD, mode: "customer_and_opportunity" },
      ),
    );
    await assert.rejects(() =>
      h.service.convertLead(
        { ...ctx, companyId: "company-2" },
        { companyId: "company-2", leadId: LEAD, mode: "customer_and_opportunity" },
      ),
    );
    assert.equal(h.customerCalls, 0);
    assert.equal(h.ensureCalls, 0);
  });

  it("records activity and the LeadConverted event with customer + opportunity outcomes", async () => {
    const h = createHarness();
    await convertWithOpportunity(h);
    assert.equal(h.activities.length, 1);
    const activity = h.activities[0]!;
    assert.equal(activity.activityType, "converted");
    assert.deepEqual(activity.payload, {
      mode: "customer_and_opportunity",
      customerId: "cust-1",
      customerOutcome: "created",
      opportunityId: "opp-1",
      opportunityOutcome: "created",
    });
    assert.match(activity.summary, /opp-1/);
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0]!.type, "lead_converted");
    assert.equal(h.events[0]!.payload.opportunityId, "opp-1");
  });

  it("returns the navigation payload (customerId + opportunityId + mode + outcomes)", async () => {
    const h = createHarness();
    const result = await convertWithOpportunity(h);
    assert.deepEqual(
      {
        customerId: result.customerId,
        opportunityId: result.opportunityId,
        mode: result.mode,
        customerCreated: result.customerCreated,
        opportunityCreated: result.opportunityCreated,
        alreadyConverted: result.alreadyConverted,
      },
      {
        customerId: "cust-1",
        opportunityId: "opp-1",
        mode: "customer_and_opportunity",
        customerCreated: true,
        opportunityCreated: true,
        alreadyConverted: false,
      },
    );
  });
});

describe("LeadCommandService.convertLead — customer-only (legacy semantics)", () => {
  it("defaults to customer-only and never touches the opportunity platform", async () => {
    const h = createHarness();
    const result = await h.service.convertLead(ctx, { companyId: COMPANY, leadId: LEAD });
    assert.equal(result.mode, "customer");
    assert.equal(result.opportunityId, null);
    assert.equal(result.opportunityCreated, null);
    assert.equal(h.ensureCalls, 0);
    assert.equal(h.activities[0]!.summary, "Converted to customer cust-1");
  });

  it("does not require opportunities.convert in customer-only mode", async () => {
    const h = createHarness();
    const result = await h.service.convertLead(
      { ...ctx, hasPermission: (code) => code !== "opportunities.convert" },
      { companyId: COMPANY, leadId: LEAD, mode: "customer" },
    );
    assert.equal(result.lead.lifecycleStatus, "converted");
  });

  it("works without claim support (repository fallback)", async () => {
    const h = createHarness({ withClaims: false });
    const result = await h.service.convertLead(ctx, { companyId: COMPANY, leadId: LEAD });
    assert.equal(result.customerId, "cust-1");
  });

  it("rejects an unknown conversion mode", async () => {
    const h = createHarness();
    await assert.rejects(() =>
      h.service.convertLead(ctx, {
        companyId: COMPANY,
        leadId: LEAD,
        mode: "everything" as unknown as "customer",
      }),
    );
  });
});
