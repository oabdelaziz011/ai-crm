import type { ApplicationPorts, CustomerReadModel, BookingReadModel, TimelineReadModel, NotificationReadModel, AnalyticsMetricModel, EmployeeWorkloadModel, RevenueSummaryModel, LeadReadModel, OpportunityReadModel, CatalogProductReadModel, OpportunityLineItemReadModel, ProductCategoryReadModel, QuoteReadModel, QuoteLineItemReadModel, QuoteApprovalReadModel, QuoteHistoryReadModel, QuoteTemplateReadModel, PaymentReadModel, InvoiceReadModel, TaskReadModel, FileReadModel, WorkflowExecutionModel } from "../ports/repository-ports.js";
import type { EntityContactReadModel, EntityTagReadModel, EntityActivityReadModel, EntityFileReadModel, EntityCustomFieldValueReadModel } from "../entity/entity-models.js";
import { createCustomerEntityFacadePorts } from "../entity/customer-entity-facade.js";
import { createConfigurationCachePort } from "../cache/configuration-cache-port.js";
import type { ConfigurationRecord } from "../ports/configuration-ports.js";
import type { FeatureFlagRecord, FeatureFlagUpsertInput } from "../ports/feature-flag-ports.js";
import type { CompanyLicenseState, PlanEntitlements } from "../ports/license-ports.js";
import {
  featureFlagEngine,
  licensingEngine,
  type FeatureFlagRow,
  type FeatureFlagResolutionContext,
} from "@workspace/configuration-platform";

const now = () => new Date().toISOString();
const randomId = () => crypto.randomUUID();
const mockConfigurations = new Map<string, ConfigurationRecord>();
const mockFeatureFlags = new Map<string, FeatureFlagRecord>();
const mockCompanyLicenses = new Map<string, CompanyLicenseState>();
const mockPlanEntitlements = new Map<string, PlanEntitlements>();

function defaultPlanEntitlements(planCode: string): PlanEntitlements {
  const enterprise = planCode === "enterprise";
  const pro = planCode === "pro" || enterprise;
  const features: Record<string, boolean> = {
    "ai.chat": true,
    "knowledge.platform": pro,
    "workflow.automation": pro,
    "ai.employee": enterprise,
    "ai.analytics": enterprise,
    "customer.portal": pro,
    "public.booking": true,
    "leads.management": true,
    "tasks.management": pro,
    "operations.workspace": true,
    "tool.calling": enterprise,
    embeddings: enterprise,
  };
  return Object.freeze({
    planCode,
    features: Object.freeze(features),
    limits: Object.freeze({ users: enterprise ? 500 : pro ? 50 : 10 }),
    modules: Object.freeze(enterprise ? ["*"] : pro ? ["crm", "operations", "booking"] : ["crm", "operations"]),
  });
}

function seedLicense(tenantId: string): CompanyLicenseState {
  return Object.freeze({
    tenantId,
    planCode: "enterprise",
    status: "active",
    trialEndsAt: null,
    expiresAt: null,
    graceEndsAt: null,
    addOns: Object.freeze([]),
  });
}

function featureFlagKey(input: Pick<FeatureFlagUpsertInput, "featureKey" | "scopeType" | "scopeId" | "environment">) {
  return `${input.featureKey}:${input.scopeType}:${input.scopeId ?? ""}:${input.environment ?? "all"}`;
}

function toFeatureFlagRow(record: FeatureFlagRecord): FeatureFlagRow {
  return Object.freeze({
    featureKey: record.featureKey,
    scopeType: record.scopeType as FeatureFlagRow["scopeType"],
    scopeId: record.scopeId,
    enabled: record.enabled,
    rolloutPercentage: record.rolloutPercentage,
    environment: record.environment as FeatureFlagRow["environment"],
    activatesAt: record.activatesAt,
    expiresAt: record.expiresAt,
    prerequisites: record.prerequisites,
    priority: record.priority,
  });
}

function listMockFeatureFlagRows(
  tenantId: string,
  context: FeatureFlagResolutionContext,
): readonly FeatureFlagRow[] {
  const license = mockCompanyLicenses.get(tenantId) ?? seedLicense(tenantId);
  const planCode = context.planId ?? license.planCode;
  return [...mockFeatureFlags.values()]
    .filter((row) => {
      if (row.scopeType === "global") return true;
      if (row.scopeType === "company") return row.scopeId === tenantId;
      if (row.scopeType === "plan") return row.scopeId === planCode;
      if (row.scopeType === "branch") return Boolean(context.branchId && row.scopeId === context.branchId);
      if (row.scopeType === "department") return Boolean(context.departmentId && row.scopeId === context.departmentId);
      if (row.scopeType === "role") return Boolean(context.roleName && row.scopeId === context.roleName);
      if (row.scopeType === "user") return Boolean(context.userId && row.scopeId === context.userId);
      return false;
    })
    .map(toFeatureFlagRow);
}

function seedCustomer(overrides?: Partial<CustomerReadModel>): CustomerReadModel {
  return Object.freeze({
    id: overrides?.id ?? "cust_1",
    tenantId: overrides?.tenantId ?? "tenant_1",
    displayName: overrides?.displayName ?? "Sara Hassan",
    email: overrides?.email ?? "sara@example.com",
    phone: overrides?.phone,
    isVip: overrides?.isVip ?? true,
    outstandingBalanceCents: overrides?.outstandingBalanceCents ?? 4500,
    currentStatus: overrides?.currentStatus ?? "Checked In",
    createdAt: overrides?.createdAt ?? now(),
  });
}

function seedBooking(overrides?: Partial<BookingReadModel>): BookingReadModel {
  return Object.freeze({
    id: overrides?.id ?? randomId(),
    tenantId: overrides?.tenantId ?? "tenant_1",
    customerId: overrides?.customerId ?? "cust_1",
    customerName: overrides?.customerName ?? "Sara Hassan",
    reference: overrides?.reference ?? "BK-001",
    scheduledAt: overrides?.scheduledAt ?? now(),
    status: overrides?.status ?? "Confirmed",
    paymentStatus: overrides?.paymentStatus ?? "Partial",
    employeeId: overrides?.employeeId,
    employeeName: overrides?.employeeName ?? "Dr. Amira",
    roomId: overrides?.roomId,
  });
}

export function createMockApplicationPorts(): ApplicationPorts & {
  _stores: {
    customers: Map<string, CustomerReadModel>;
    bookings: Map<string, BookingReadModel>;
    leads: Map<string, LeadReadModel>;
    timeline: TimelineReadModel[];
  };
} {
  const customers = new Map<string, CustomerReadModel>([["cust_1", seedCustomer()]]);
  const bookings = new Map<string, BookingReadModel>([
    ["bk_1", seedBooking({ id: "bk_1", reference: "BK-9912" })],
  ]);
  const leads = new Map<string, LeadReadModel>([
    [
      "lead_1",
      Object.freeze({
        id: "lead_1",
        tenantId: "tenant_1",
        name: "Fatima Noor",
        contactPerson: "Fatima Noor",
        email: "fatima@example.com",
        phone: "+1-555-0101",
        companyName: "Acme Corp",
        lifecycleStatus: "qualified",
        priority: "high",
        score: 72,
        expectedValue: 15000,
        currency: "USD",
        pipelineId: "pipe_1",
        stageId: "stage_qualified",
        stage: "Qualified",
        ownerId: "user_admin",
        owner: "Admin",
        customerId: null,
        conversationId: null,
        isQualified: true,
        sourceId: "source_website",
        source: "Website",
        expectedCloseDate: null,
        temperature: "hot",
        tags: ["enterprise"],
        notes: "",
        lastActivityAt: now(),
        createdAt: now(),
        updatedAt: now(),
      }),
    ],
  ]);
  const opportunities = new Map<string, OpportunityReadModel>();
  const products = new Map<string, CatalogProductReadModel>();
  const categories: ProductCategoryReadModel[] = [];
  const lineItems: OpportunityLineItemReadModel[] = [];
  const quotes = new Map<string, QuoteReadModel>();
  const quoteLines: QuoteLineItemReadModel[] = [];
  const quoteApprovals: QuoteApprovalReadModel[] = [];
  const quoteHistory: QuoteHistoryReadModel[] = [];
  const quoteTemplates: QuoteTemplateReadModel[] = [
    Object.freeze({
      id: "qt_crm",
      tenantId: "tenant_1",
      name: "CRM Implementation",
      slug: "crm-implementation",
      description: "Default CRM implementation quote",
      defaultLanguage: "en",
      defaultCurrency: "USD",
      validityDays: 30,
      isActive: true,
    }),
  ];
  const mockOppStages = [
    Object.freeze({
      id: "opp_stage_qualification",
      tenantId: "tenant_1",
      pipelineId: "opp_pipe_1",
      name: "Qualification",
      slug: "qualification",
      stageKey: "qualification",
      sortOrder: 0,
      defaultProbabilityPercent: 10,
      isTerminal: false,
    }),
    Object.freeze({
      id: "opp_stage_discovery",
      tenantId: "tenant_1",
      pipelineId: "opp_pipe_1",
      name: "Discovery",
      slug: "discovery",
      stageKey: "discovery",
      sortOrder: 1,
      defaultProbabilityPercent: 25,
      isTerminal: false,
    }),
  ];
  const mockPipelines = [
    Object.freeze({ id: "pipe_1", tenantId: "tenant_1", name: "Default Pipeline", slug: "default", isDefault: true, isActive: true, allowBackwardStageMovement: true }),
  ];
  const mockStages = [
    Object.freeze({ id: "stage_new", tenantId: "tenant_1", pipelineId: "pipe_1", name: "New", slug: "new", lifecycleStatus: "new", sortOrder: 0, probabilityPercent: 10, isTerminal: false }),
    Object.freeze({ id: "stage_qualified", tenantId: "tenant_1", pipelineId: "pipe_1", name: "Qualified", slug: "qualified", lifecycleStatus: "qualified", sortOrder: 1, probabilityPercent: 40, isTerminal: false }),
  ];
  const timeline: TimelineReadModel[] = [
    Object.freeze({
      id: "tl_1",
      occurredAt: now(),
      title: "Booking Created",
      description: "Appointment scheduled",
      actor: "Reception",
      eventType: "BookingCreated",
    }),
  ];

  const entityContacts = new Map<string, EntityContactReadModel>();
  const entityTags = new Map<string, EntityTagReadModel>();
  const entityTagAssignments = new Map<string, { tenantId: string; entityType: string; entityId: string; tagId: string }>();
  const entityActivities = new Map<string, EntityActivityReadModel>();
  const entityFiles = new Map<string, EntityFileReadModel>();
  const entityCustomFieldValues = new Map<string, EntityCustomFieldValueReadModel>();

  const ports: ApplicationPorts = {
    customerRead: {
      async getById(tenantId, customerId) {
        const c = customers.get(customerId);
        return c && c.tenantId === tenantId ? c : null;
      },
      async search(tenantId, query, limit = 10) {
        return [...customers.values()]
          .filter((c) => c.tenantId === tenantId && c.displayName.toLowerCase().includes(query.toLowerCase()))
          .slice(0, limit);
      },
    },
    customerWrite: {
      async create(input) {
        const c = seedCustomer({
          id: randomId(),
          tenantId: input.tenantId,
          displayName: input.displayName,
          email: input.email,
          phone: input.phone,
        });
        customers.set(c.id, c);
        return c;
      },
      async update(tenantId, customerId, patch) {
        const existing = customers.get(customerId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const updated = seedCustomer({ ...existing, ...patch, id: customerId, tenantId });
        customers.set(customerId, updated);
        return updated;
      },
    },
    leadRead: {
      async getById(tenantId, leadId) {
        const l = leads.get(leadId);
        return l && l.tenantId === tenantId ? l : null;
      },
      async findByCustomer(tenantId, _customerId) {
        const l = leads.values().next().value;
        return l && l.tenantId === tenantId ? l : null;
      },
      async search(tenantId, query, limit = 10) {
        return [...leads.values()]
          .filter((l) => l.tenantId === tenantId && l.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, limit);
      },
      async list(tenantId, filter) {
        const items = [...leads.values()].filter((l) => l.tenantId === tenantId);
        return Object.freeze({ items: Object.freeze(items.slice(0, filter?.limit ?? 50)), total: items.length });
      },
      async listPipelines(tenantId) {
        return mockPipelines.filter((p) => p.tenantId === tenantId);
      },
      async listStages(tenantId, pipelineId) {
        return mockStages.filter((s) => s.tenantId === tenantId && s.pipelineId === pipelineId);
      },
      async listSources(tenantId) {
        return [
          Object.freeze({
            id: "source_website",
            tenantId,
            name: "Website",
            slug: "website",
            channelType: "web",
            isActive: true,
          }),
        ];
      },
      async getPipelineBoard(tenantId, pipelineId) {
        const pipeline = mockPipelines.find((p) => p.id === pipelineId && p.tenantId === tenantId);
        if (!pipeline) throw new Error("not found");
        const stages = mockStages.filter((s) => s.pipelineId === pipelineId);
        const leadsByStage: Record<string, LeadReadModel[]> = {};
        for (const stage of stages) leadsByStage[stage.id] = [];
        for (const lead of leads.values()) {
          if (lead.tenantId === tenantId && lead.pipelineId === pipelineId) {
            (leadsByStage[lead.stageId] ??= []).push(lead);
          }
        }
        return Object.freeze({ pipeline, stages, leadsByStage: Object.freeze(leadsByStage) });
      },
      async getDashboardMetrics(tenantId) {
        const items = [...leads.values()].filter((l) => l.tenantId === tenantId);
        return Object.freeze({
          totalLeads: items.length,
          leadsByStatus: Object.freeze(Object.fromEntries(items.map((l) => [l.lifecycleStatus, 1]))),
          conversionsInPeriod: 0,
          createdInPeriod: items.length,
          forecastValue: items.reduce((s, l) => s + (l.expectedValue ?? 0), 0),
          conversionRate: 0.12,
          pipelineMetrics: Object.freeze([]),
        });
      },
    },
    leadWrite: {
      async create(input) {
        const name = input.name;
        const contactPerson = input.contactPerson ?? input.name;
        const expectedValue = input.expectedValue ?? null;
        const ownerId = input.ownerId ?? null;
        const stage = mockStages.find((s) => s.id === (input.stageId ?? "stage_new"));
        const lead = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          name,
          contactPerson,
          email: input.email ?? null,
          phone: input.phone ?? null,
          companyName: input.companyName ?? null,
          lifecycleStatus: stage?.lifecycleStatus ?? "new",
          priority: input.priority ?? "normal",
          score: 0,
          expectedValue,
          currency: "USD",
          pipelineId: input.pipelineId ?? "pipe_1",
          stageId: input.stageId ?? stage?.id ?? "stage_new",
          stage: stage?.name ?? "New",
          ownerId,
          owner: ownerId ? "Owner" : null,
          customerId: null,
          conversationId: null,
          isQualified: false,
          sourceId: input.sourceId ?? null,
          source: input.sourceId ? "Source" : null,
          expectedCloseDate: input.expectedCloseDate ?? null,
          temperature: input.temperature ?? null,
          tags: input.tags ? [...input.tags] : [],
          notes: input.notes ?? "",
          lastActivityAt: now(),
          createdAt: now(),
          updatedAt: now(),
        });
        leads.set(lead.id, lead);
        return lead;
      },
      async update(tenantId, leadId, patch) {
        const existing = leads.get(leadId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const { actorUserId: _actor, ...crmPatch } = patch;
        const updated = Object.freeze({
          ...existing,
          ...crmPatch,
          tags: crmPatch.tags ? [...crmPatch.tags] : existing.tags,
          updatedAt: now(),
        });
        leads.set(leadId, updated);
        return updated;
      },
      async assign(tenantId, leadId, assigneeUserId) {
        const existing = leads.get(leadId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const updated = Object.freeze({ ...existing, ownerId: assigneeUserId, owner: "Owner", updatedAt: now() });
        leads.set(leadId, updated);
        return updated;
      },
      async changeStage(tenantId, leadId, stageId) {
        const existing = leads.get(leadId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const stage = mockStages.find((s) => s.id === stageId);
        const updated = Object.freeze({
          ...existing,
          stageId,
          stage: stage?.name ?? existing.stage,
          lifecycleStatus: stage?.lifecycleStatus ?? existing.lifecycleStatus,
          updatedAt: now(),
        });
        leads.set(leadId, updated);
        return updated;
      },
      async bulkChangeStage(tenantId, leadIds, stageId) {
        for (const leadId of leadIds) {
          const existing = leads.get(leadId);
          if (existing?.tenantId === tenantId) {
            const stage = mockStages.find((s) => s.id === stageId);
            leads.set(
              leadId,
              Object.freeze({
                ...existing,
                stageId,
                stage: stage?.name ?? existing.stage,
                lifecycleStatus: stage?.lifecycleStatus ?? existing.lifecycleStatus,
                updatedAt: now(),
              }),
            );
          }
        }
      },
      async convert(tenantId, leadId) {
        const l = leads.get(leadId);
        if (!l || l.tenantId !== tenantId) throw new Error("not found");
        const customerId = randomId();
        const updated = Object.freeze({ ...l, lifecycleStatus: "converted", customerId });
        leads.set(leadId, updated);
        return Object.freeze({ lead: updated, customerId });
      },
      async archive(tenantId, leadId) {
        leads.delete(leadId);
        void tenantId;
      },
    },
    opportunityRead: {
      async getById(tenantId, opportunityId) {
        const o = opportunities.get(opportunityId);
        return o && o.tenantId === tenantId ? o : null;
      },
      async list(tenantId, filter) {
        const items = [...opportunities.values()].filter((o) => o.tenantId === tenantId);
        return Object.freeze({
          items: Object.freeze(items.slice(0, filter?.limit ?? 50)),
          total: items.length,
        });
      },
      async listPipelines(tenantId) {
        return [
          Object.freeze({
            id: "opp_pipe_1",
            tenantId,
            name: "Sales Execution",
            slug: "sales-execution",
            isDefault: true,
            isActive: true,
          }),
        ];
      },
      async listStages(tenantId, pipelineId) {
        return mockOppStages.filter((s) => s.tenantId === tenantId && s.pipelineId === pipelineId);
      },
      async getPipelineBoard(tenantId, pipelineId) {
        const stages = mockOppStages.filter((s) => s.tenantId === tenantId && s.pipelineId === pipelineId);
        return Object.freeze({
          pipelineId,
          stages: Object.freeze(
            stages.map((stage) =>
              Object.freeze({
                ...stage,
                opportunities: Object.freeze(
                  [...opportunities.values()].filter(
                    (o) => o.tenantId === tenantId && o.stageId === stage.id,
                  ),
                ),
              }),
            ),
          ),
        });
      },
      async listHistory() {
        return [];
      },
    },
    opportunityWrite: {
      async create(input) {
        const stage = mockOppStages.find((s) => s.id === (input.stageId ?? "opp_stage_qualification"));
        const opp = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          name: input.name,
          leadId: input.leadId ?? null,
          customerId: input.customerId ?? null,
          companyName: input.companyName ?? null,
          primaryContact: input.primaryContactName ?? "",
          ownerId: input.ownerUserId ?? null,
          owner: null,
          stageId: stage?.id ?? "opp_stage_qualification",
          stage: stage?.name ?? "Qualification",
          stageKey: stage?.stageKey ?? "qualification",
          pipelineId: input.pipelineId ?? "opp_pipe_1",
          expectedRevenue: input.expectedRevenue ?? null,
          weightedRevenue:
            input.expectedRevenue != null
              ? Math.round(input.expectedRevenue * ((stage?.defaultProbabilityPercent ?? 10) / 100) * 100) /
                100
              : null,
          currency: input.currency ?? "USD",
          probabilityPercent: stage?.defaultProbabilityPercent ?? 10,
          probabilityConfidence: null,
          probabilitySource: "manual",
          probabilityReason: "stage default",
          expectedCloseDate: input.expectedCloseDate ?? null,
          country: input.country ?? null,
          market: input.market ?? null,
          language: input.language ?? null,
          createdFromLead: Boolean(input.leadId),
          aiScoreSnapshot: null,
          aiContextSnapshot: Object.freeze({}),
          currentQuoteId: null,
          createdAt: now(),
          updatedAt: now(),
        }) satisfies OpportunityReadModel;
        opportunities.set(opp.id, opp);
        return opp;
      },
      async createFromLead(input) {
        const lead = leads.get(input.leadId);
        if (!lead || lead.tenantId !== input.tenantId) throw new Error("lead not found");
        return this.create({
          tenantId: input.tenantId,
          name: input.name ?? lead.name,
          leadId: lead.id,
          customerId: lead.customerId ?? undefined,
          companyName: lead.companyName ?? undefined,
          primaryContactName: lead.contactPerson,
          ownerUserId: lead.ownerId ?? undefined,
          expectedRevenue: lead.expectedValue ?? undefined,
          currency: lead.currency,
          expectedCloseDate: lead.expectedCloseDate,
          actorUserId: input.actorUserId,
        });
      },
      async update(tenantId, opportunityId, patch) {
        const existing = opportunities.get(opportunityId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const {
          actorUserId: _a,
          primaryContactName,
          ownerUserId,
          ...rest
        } = patch;
        const updated = Object.freeze({
          ...existing,
          ...rest,
          primaryContact: primaryContactName ?? existing.primaryContact,
          ownerId: ownerUserId !== undefined ? ownerUserId : existing.ownerId,
          updatedAt: now(),
        });
        opportunities.set(opportunityId, updated);
        return updated;
      },
      async changeStage(tenantId, opportunityId, stageId) {
        const existing = opportunities.get(opportunityId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const stage = mockOppStages.find((s) => s.id === stageId);
        const updated = Object.freeze({
          ...existing,
          stageId,
          stage: stage?.name ?? existing.stage,
          stageKey: stage?.stageKey ?? existing.stageKey,
          probabilityPercent: stage?.defaultProbabilityPercent ?? existing.probabilityPercent,
          updatedAt: now(),
        });
        opportunities.set(opportunityId, updated);
        return updated;
      },
      async updateProbability(tenantId, opportunityId, input) {
        const existing = opportunities.get(opportunityId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const updated = Object.freeze({
          ...existing,
          probabilityPercent: input.percent,
          probabilityConfidence: input.confidence ?? null,
          probabilitySource: input.source ?? "manual",
          probabilityReason: input.reason ?? "",
          weightedRevenue:
            existing.expectedRevenue != null
              ? Math.round(existing.expectedRevenue * (input.percent / 100) * 100) / 100
              : null,
          updatedAt: now(),
        });
        opportunities.set(opportunityId, updated);
        return updated;
      },
      async archive(tenantId, opportunityId) {
        opportunities.delete(opportunityId);
        void tenantId;
      },
    },
    productRead: {
      async getById(tenantId, productId) {
        const p = products.get(productId);
        return p && p.tenantId === tenantId ? p : null;
      },
      async list(tenantId, filter) {
        const items = [...products.values()].filter((p) => p.tenantId === tenantId);
        return Object.freeze({
          items: Object.freeze(items.slice(0, filter?.limit ?? 50)),
          total: items.length,
        });
      },
      async listCategories(tenantId) {
        return categories.filter((c) => c.tenantId === tenantId);
      },
      async listRegionalPrices() {
        return [];
      },
      async listHistory() {
        return [];
      },
      async listOpportunityLines(tenantId, opportunityId) {
        return lineItems.filter((l) => l.opportunityId === opportunityId);
      },
    },
    productWrite: {
      async create(input) {
        const product = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          categoryId: input.categoryId ?? null,
          productType: input.productType ?? "product",
          name: input.name,
          sku: input.sku,
          brand: input.brand ?? "",
          description: input.description ?? "",
          basePrice: input.basePrice ?? 0,
          currency: input.currency ?? "USD",
          taxClass: input.taxClass ?? "standard",
          cost: input.cost ?? null,
          marginPercent: null,
          isActive: true,
          subscriptionInterval: null,
          subscriptionPrice: null,
          trackInventory: false,
          stockQuantity: null,
          unit: "each",
          tags: input.tags ? [...input.tags] : [],
          imageUrls: [],
          documentUrls: [],
          createdAt: now(),
          updatedAt: now(),
        }) satisfies CatalogProductReadModel;
        products.set(product.id, product);
        return product;
      },
      async update(tenantId, productId, patch) {
        const existing = products.get(productId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const { actorUserId: _a, ...rest } = patch;
        const updated = Object.freeze({ ...existing, ...rest, updatedAt: now() });
        products.set(productId, updated);
        return updated;
      },
      async archive(tenantId, productId) {
        products.delete(productId);
        void tenantId;
      },
      async createCategory(input) {
        const category = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          parentId: input.parentId ?? null,
          name: input.name,
          slug: input.name.toLowerCase().replace(/\s+/g, "-"),
          description: input.description ?? "",
          sortOrder: 0,
          isActive: true,
        }) satisfies ProductCategoryReadModel;
        categories.push(category);
        return category;
      },
      async upsertRegionalPrice(input) {
        return Object.freeze({
          id: input.id ?? randomId(),
          productId: input.productId,
          country: input.country ?? null,
          market: input.market ?? null,
          region: input.region ?? null,
          localPrice: input.localPrice,
          currencyOverride: input.currencyOverride ?? null,
          isActive: true,
        });
      },
      async attachToOpportunity(input) {
        const product = products.get(input.productId);
        if (!product) throw new Error("product not found");
        const qty = input.quantity ?? 1;
        const unitPrice = input.unitPriceOverride ?? product.basePrice;
        const discount = input.discountPercent ?? 0;
        const tax = input.taxPercent ?? 0;
        const subtotal = Math.round(qty * unitPrice * (1 - discount / 100) * 100) / 100;
        const taxAmount = Math.round(subtotal * (tax / 100) * 100) / 100;
        const line = Object.freeze({
          id: randomId(),
          opportunityId: input.opportunityId,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: qty,
          unitPrice,
          discountPercent: discount,
          taxPercent: tax,
          currency: product.currency,
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
        }) satisfies OpportunityLineItemReadModel;
        lineItems.push(line);
        return line;
      },
      async updateOpportunityLine(input) {
        const idx = lineItems.findIndex((l) => l.id === input.lineId);
        if (idx < 0) throw new Error("line not found");
        const existing = lineItems[idx]!;
        const qty = input.quantity ?? existing.quantity;
        const unitPrice = input.unitPrice ?? existing.unitPrice;
        const discount = input.discountPercent ?? existing.discountPercent;
        const tax = input.taxPercent ?? existing.taxPercent;
        const subtotal = Math.round(qty * unitPrice * (1 - discount / 100) * 100) / 100;
        const taxAmount = Math.round(subtotal * (tax / 100) * 100) / 100;
        const updated = Object.freeze({
          ...existing,
          quantity: qty,
          unitPrice,
          discountPercent: discount,
          taxPercent: tax,
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
        });
        lineItems[idx] = updated;
        return updated;
      },
      async removeOpportunityLine(_tenantId, lineId) {
        const idx = lineItems.findIndex((l) => l.id === lineId);
        if (idx >= 0) lineItems.splice(idx, 1);
      },
    },
    quoteRead: {
      async getById(tenantId, quoteId) {
        const q = quotes.get(quoteId);
        return q && q.tenantId === tenantId ? q : null;
      },
      async list(tenantId, filter) {
        let items = [...quotes.values()].filter((q) => q.tenantId === tenantId);
        if (filter?.opportunityId) items = items.filter((q) => q.opportunityId === filter.opportunityId);
        if (filter?.status) items = items.filter((q) => q.status === filter.status);
        if (filter?.currentOnly) items = items.filter((q) => q.isCurrent);
        return Object.freeze({
          items: Object.freeze(items.slice(0, filter?.limit ?? 50)),
          total: items.length,
        });
      },
      async listLines(_tenantId, quoteId) {
        return quoteLines.filter((l) => l.quoteId === quoteId);
      },
      async listVersions(_tenantId, quoteFamilyId) {
        return [...quotes.values()].filter((q) => q.quoteFamilyId === quoteFamilyId);
      },
      async listTemplates(tenantId) {
        return quoteTemplates.filter((t) => t.tenantId === tenantId);
      },
      async listApprovals(_tenantId, quoteId) {
        return quoteApprovals.filter((a) => a.quoteId === quoteId);
      },
      async listHistory(_tenantId, quoteId) {
        return quoteHistory.filter((h) => h.quoteId === quoteId);
      },
    },
    quoteWrite: {
      async createFromOpportunity(input) {
        const quote = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          quoteFamilyId: randomId(),
          versionNumber: 1,
          quoteNumber: `Q-${String(quotes.size + 1).padStart(4, "0")}`,
          opportunityId: input.opportunityId,
          customerId: null,
          templateId: input.templateId ?? null,
          status: "draft",
          title: input.title ?? "Quote",
          contactName: "",
          currency: "USD",
          language: "en",
          country: null,
          market: null,
          validUntil: null,
          ownerUserId: input.actorUserId,
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          shippingTotal: 0,
          grandTotal: 0,
          weightedRevenue: null,
          opportunityProbabilityPercent: null,
          notes: "",
          isCurrent: true,
          supersededByQuoteId: null,
          sentAt: null,
          viewedAt: null,
          acceptedAt: null,
          rejectedAt: null,
          expiredAt: null,
          convertedAt: null,
          createdAt: now(),
          updatedAt: now(),
        }) satisfies QuoteReadModel;
        quotes.set(quote.id, quote);
        const opp = opportunities.get(input.opportunityId);
        if (opp) {
          opportunities.set(input.opportunityId, Object.freeze({ ...opp, currentQuoteId: quote.id }));
        }
        return { quote, lines: [] };
      },
      async createManual(input) {
        const quote = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          quoteFamilyId: randomId(),
          versionNumber: 1,
          quoteNumber: `Q-${String(quotes.size + 1).padStart(4, "0")}`,
          opportunityId: input.opportunityId ?? null,
          customerId: null,
          templateId: input.templateId ?? null,
          status: "draft",
          title: input.title,
          contactName: input.contactName ?? "",
          currency: input.currency ?? "USD",
          language: "en",
          country: null,
          market: null,
          validUntil: null,
          ownerUserId: input.actorUserId,
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          shippingTotal: 0,
          grandTotal: 0,
          weightedRevenue: null,
          opportunityProbabilityPercent: null,
          notes: "",
          isCurrent: true,
          supersededByQuoteId: null,
          sentAt: null,
          viewedAt: null,
          acceptedAt: null,
          rejectedAt: null,
          expiredAt: null,
          convertedAt: null,
          createdAt: now(),
          updatedAt: now(),
        }) satisfies QuoteReadModel;
        quotes.set(quote.id, quote);
        return quote;
      },
      async createVersion(input) {
        const existing = quotes.get(input.quoteId);
        if (!existing) throw new Error("quote not found");
        const next = Object.freeze({
          ...existing,
          id: randomId(),
          versionNumber: existing.versionNumber + 1,
          status: "draft",
          isCurrent: true,
          supersededByQuoteId: null,
          createdAt: now(),
          updatedAt: now(),
        });
        quotes.set(existing.id, Object.freeze({ ...existing, isCurrent: false, supersededByQuoteId: next.id }));
        quotes.set(next.id, next);
        return next;
      },
      async addCatalogProduct(input) {
        const quote = quotes.get(input.quoteId);
        if (!quote) throw new Error("quote not found");
        const product = products.get(input.productId);
        if (!product) throw new Error("product not found");
        const qty = input.quantity ?? 1;
        const line = Object.freeze({
          id: randomId(),
          quoteId: input.quoteId,
          lineKind: "product",
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          sectionTitle: null,
          notes: "",
          isOptional: false,
          quantity: qty,
          unitPrice: product.basePrice,
          discountPercent: input.discountPercent ?? 0,
          discountAmount: 0,
          taxPercent: input.taxPercent ?? 0,
          currency: product.currency,
          subtotal: qty * product.basePrice,
          taxAmount: 0,
          total: qty * product.basePrice,
          sortOrder: quoteLines.length,
        }) satisfies QuoteLineItemReadModel;
        quoteLines.push(line);
        const updated = Object.freeze({
          ...quote,
          subtotal: quote.subtotal + line.subtotal,
          grandTotal: quote.grandTotal + line.total,
          updatedAt: now(),
        });
        quotes.set(quote.id, updated);
        return { line, quote: updated };
      },
      async updateLine(input) {
        const idx = quoteLines.findIndex((l) => l.id === input.lineId);
        if (idx < 0) throw new Error("line not found");
        const existing = quoteLines[idx]!;
        const qty = input.quantity ?? existing.quantity;
        const unitPrice = input.unitPrice ?? existing.unitPrice;
        const updatedLine = Object.freeze({
          ...existing,
          quantity: qty,
          unitPrice,
          discountPercent: input.discountPercent ?? existing.discountPercent,
          discountAmount: input.discountAmount ?? existing.discountAmount,
          taxPercent: input.taxPercent ?? existing.taxPercent,
          subtotal: qty * unitPrice,
          total: qty * unitPrice,
        });
        quoteLines[idx] = updatedLine;
        const quote = quotes.get(input.quoteId);
        if (!quote) throw new Error("quote not found");
        return { line: updatedLine, quote };
      },
      async removeLine(input) {
        const idx = quoteLines.findIndex((l) => l.id === input.lineId);
        if (idx >= 0) quoteLines.splice(idx, 1);
        const quote = quotes.get(input.quoteId);
        if (!quote) throw new Error("quote not found");
        return quote;
      },
      async changeStatus(input) {
        const existing = quotes.get(input.quoteId);
        if (!existing) throw new Error("quote not found");
        const updated = Object.freeze({ ...existing, status: input.status, updatedAt: now() });
        quotes.set(input.quoteId, updated);
        return updated;
      },
      async requestApproval(input) {
        const existing = quotes.get(input.quoteId);
        if (!existing) throw new Error("quote not found");
        quoteApprovals.push(
          Object.freeze({
            id: randomId(),
            quoteId: input.quoteId,
            status: "pending",
            requestedBy: input.actorUserId,
            decidedBy: null,
            decisionNote: "",
            requestedAt: now(),
            decidedAt: null,
          }),
        );
        const updated = Object.freeze({ ...existing, status: "internal_review", updatedAt: now() });
        quotes.set(input.quoteId, updated);
        return updated;
      },
      async decideApproval(input) {
        const approval = quoteApprovals.find((a) => a.id === input.approvalId);
        if (approval) {
          const idx = quoteApprovals.indexOf(approval);
          quoteApprovals[idx] = Object.freeze({
            ...approval,
            status: input.status,
            decidedBy: input.actorUserId,
            decisionNote: input.decisionNote ?? "",
            decidedAt: now(),
          });
        }
        const existing = quotes.get(input.quoteId);
        if (!existing) throw new Error("quote not found");
        const updated = Object.freeze({
          ...existing,
          status: input.status === "approved" ? "draft" : "rejected",
          updatedAt: now(),
        });
        quotes.set(input.quoteId, updated);
        return updated;
      },
      async archive(input) {
        quotes.delete(input.quoteId);
      },
    },
    bookingRead: {
      async getById(tenantId, bookingId) {
        const b = bookings.get(bookingId);
        return b && b.tenantId === tenantId ? b : null;
      },
      async listQueue(tenantId, filter) {
        return [...bookings.values()]
          .filter((b) => b.tenantId === tenantId)
          .filter((b) => !filter.search || b.customerName.includes(filter.search));
      },
      async listCalendar(tenantId, from, to, employeeId) {
        return [...bookings.values()].filter(
          (b) => b.tenantId === tenantId && (!employeeId || b.employeeId === employeeId),
        );
      },
      async listForCustomer(tenantId, customerId) {
        return [...bookings.values()].filter((b) => b.tenantId === tenantId && b.customerId === customerId);
      },
    },
    bookingWrite: {
      async create(input) {
        const b = seedBooking({
          id: randomId(),
          tenantId: input.tenantId,
          customerId: input.customerId,
          scheduledAt: input.scheduledAt,
          employeeId: input.employeeId,
          status: "Confirmed",
        });
        bookings.set(b.id, b);
        return b;
      },
      async reschedule(tenantId, bookingId, scheduledAt) {
        const b = bookings.get(bookingId);
        if (!b || b.tenantId !== tenantId) throw new Error("not found");
        const updated = seedBooking({ ...b, scheduledAt });
        bookings.set(bookingId, updated);
        return updated;
      },
      async cancel(tenantId, bookingId, _reason) {
        const b = bookings.get(bookingId);
        if (!b || b.tenantId !== tenantId) throw new Error("not found");
        const updated = seedBooking({ ...b, status: "Cancelled" });
        bookings.set(bookingId, updated);
        return updated;
      },
      async checkIn(tenantId, bookingId, roomId) {
        const b = bookings.get(bookingId);
        if (!b || b.tenantId !== tenantId) throw new Error("not found");
        const updated = seedBooking({ ...b, status: "Checked In", roomId });
        bookings.set(bookingId, updated);
        return updated;
      },
      async checkOut(tenantId, bookingId) {
        const b = bookings.get(bookingId);
        if (!b || b.tenantId !== tenantId) throw new Error("not found");
        const updated = seedBooking({ ...b, status: "Completed" });
        bookings.set(bookingId, updated);
        return updated;
      },
      async assignEmployee(tenantId, bookingId, employeeId) {
        const b = bookings.get(bookingId);
        if (!b || b.tenantId !== tenantId) throw new Error("not found");
        const updated = seedBooking({ ...b, employeeId });
        bookings.set(bookingId, updated);
        return updated;
      },
      async markNoShow(tenantId, bookingId) {
        const b = bookings.get(bookingId);
        if (!b || b.tenantId !== tenantId) throw new Error("not found");
        const updated = seedBooking({ ...b, status: "no_show" });
        bookings.set(bookingId, updated);
        return updated;
      },
      async transitionClinicStatus(tenantId, bookingId, status) {
        const b = bookings.get(bookingId);
        if (!b || b.tenantId !== tenantId) throw new Error("not found");
        const display =
          status === "with_nurse" ? "With Nurse" : status === "in_progress" ? "In Progress" : "Archived";
        const updated = seedBooking({ ...b, status: display });
        bookings.set(bookingId, updated);
        return updated;
      },
      async completeTriage(tenantId, bookingId) {
        const b = bookings.get(bookingId);
        if (!b || b.tenantId !== tenantId) throw new Error("not found");
        const updated = seedBooking({ ...b, status: "With Nurse" });
        bookings.set(bookingId, updated);
        return updated;
      },
    },
    paymentRead: {
      async getById() { return null; },
      async listForCustomer() { return []; },
    },
    paymentWrite: {
      async collect(input) {
        return Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          customerId: input.customerId,
          amountCents: input.amountCents,
          currency: input.currency,
          method: input.method,
          collectedAt: now(),
        } satisfies PaymentReadModel);
      },
      async refund(_tenantId, paymentId, amountCents) {
        return Object.freeze({
          id: paymentId,
          tenantId: "tenant_1",
          customerId: "cust_1",
          amountCents,
          currency: "USD",
          method: "refund",
          collectedAt: now(),
        });
      },
    },
    invoiceRead: {
      async getById() { return null; },
      async listForCustomer() { return []; },
    },
    invoiceWrite: {
      async generate(input) {
        return Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          customerId: input.customerId,
          amountCents: input.amountCents,
          currency: input.currency,
          generatedAt: now(),
          status: "open",
        } satisfies InvoiceReadModel);
      },
    },
    timelineRead: {
      async listForEntity(_tenantId, _entityType, _entityId, options = 50) {
        const limit = typeof options === "number" ? options : (options.limit ?? 50);
        return timeline.slice(0, limit);
      },
    },
    customerTagRead: {
      async listForCustomer() { return []; },
    },
    customerAddressRead: {
      async listForCustomer() { return []; },
    },
    customerContactRead: {
      async listForCustomer() { return []; },
    },
    customerCustomFieldRead: {
      async listForCustomer() { return []; },
    },
    activityRead: {
      async listForCustomer() { return []; },
    },
    fileRead: {
      async listForEntity() { return []; },
    },
    taskRead: {
      async listForEntity() { return []; },
    },
    globalSearchRead: {
      async search(tenantId, query, limit = 10) {
        return [...customers.values()]
          .filter((c) => c.tenantId === tenantId && c.displayName.toLowerCase().includes(query.toLowerCase()))
          .map((c) => Object.freeze({
            id: c.id,
            type: "customer",
            title: c.displayName,
            subtitle: c.email ?? "",
            preview: c.phone ?? "",
            score: 1,
          }));
      },
    },
    notificationRead: {
      async list(_tenantId, _userId, filter) {
        const items: NotificationReadModel[] = [
          Object.freeze({
            id: "n1",
            tenantId: "tenant_1",
            title: "VIP Arrived",
            message: "Sara checked in",
            category: "booking",
            priority: "high",
            severity: "warning",
            read: false,
            createdAt: now(),
            correlationId: "corr-1",
            entityType: "booking",
            entityId: "b1",
          }),
        ];
        const filtered = filter?.unreadOnly ? items.filter((n) => !n.read) : items;
        return Object.freeze({
          items: Object.freeze(filtered),
          total: filtered.length,
          page: filter?.page ?? 1,
          pageSize: filter?.pageSize ?? 20,
          hasMore: false,
        });
      },
      async getUnreadCount() {
        return 1;
      },
    },
    notificationWrite: {
      async create(input) {
        return Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          recipientUserId: input.recipientUserId,
          title: input.title,
          message: input.body,
          category: input.category,
          priority: input.priority,
          severity: input.severity,
          read: false,
          createdAt: now(),
          correlationId: input.correlationId,
          entityType: input.entityType,
          entityId: input.entityId,
          navigationTarget: input.navigationTarget,
        } satisfies NotificationReadModel);
      },
      async markRead() {},
      async markUnread() {},
      async markAllRead() {},
      async archive() {},
    },
    taskWrite: {
      async create(input) {
        return Object.freeze({
          id: randomId(),
          title: input.title,
          assigneeId: input.assigneeId,
          createdAt: now(),
          status: "open",
          priority: input.priority ?? "normal",
          entityType: input.entityType,
          entityId: input.entityId,
          dueAt: input.dueAt,
        } satisfies TaskReadModel);
      },
      async assign(_tenantId, taskId, assigneeId) {
        return Object.freeze({
          id: taskId,
          title: "Task",
          assigneeId,
          createdAt: now(),
          status: "open",
        } satisfies TaskReadModel);
      },
      async reassign(_tenantId, taskId, assigneeId) {
        return Object.freeze({
          id: taskId,
          title: "Task",
          assigneeId,
          createdAt: now(),
          status: "open",
        } satisfies TaskReadModel);
      },
      async start(_tenantId, taskId) {
        return Object.freeze({
          id: taskId,
          title: "Task",
          assigneeId: "user_1",
          createdAt: now(),
          status: "in_progress",
        } satisfies TaskReadModel);
      },
      async pause(_tenantId, taskId) {
        return Object.freeze({
          id: taskId,
          title: "Task",
          assigneeId: "user_1",
          createdAt: now(),
          status: "paused",
        } satisfies TaskReadModel);
      },
      async complete(_tenantId, taskId, completedBy) {
        return Object.freeze({
          id: taskId,
          title: "Task",
          assigneeId: completedBy,
          createdAt: now(),
          completedAt: now(),
          status: "completed",
        } satisfies TaskReadModel);
      },
      async cancel(_tenantId, taskId) {
        return Object.freeze({
          id: taskId,
          title: "Task",
          assigneeId: "user_1",
          createdAt: now(),
          status: "cancelled",
        } satisfies TaskReadModel);
      },
      async updatePriority(_tenantId, taskId, priority) {
        return Object.freeze({
          id: taskId,
          title: "Task",
          assigneeId: "user_1",
          createdAt: now(),
          status: "open",
          priority,
        } satisfies TaskReadModel);
      },
      async updateDueDate(_tenantId, taskId, dueAt) {
        return Object.freeze({
          id: taskId,
          title: "Task",
          assigneeId: "user_1",
          createdAt: now(),
          status: "open",
          dueAt: dueAt ?? undefined,
        } satisfies TaskReadModel);
      },
    },
    fileWrite: {
      async upload(input) {
        return Object.freeze({
          id: randomId(),
          fileName: input.fileName,
          uploadedAt: now(),
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
        } satisfies FileReadModel);
      },
    },
    workflowWrite: {
      async execute(_tenantId, workflowId) {
        return Object.freeze({
          id: randomId(),
          workflowId,
          status: "success" as const,
          executedAt: now(),
        } satisfies WorkflowExecutionModel);
      },
      async start(_tenantId, workflowId) {
        return Object.freeze({
          id: randomId(),
          workflowId,
          status: "running" as const,
          executedAt: now(),
        } satisfies WorkflowExecutionModel);
      },
      async pause(_tenantId, executionId) {
        return Object.freeze({
          id: executionId,
          workflowId: executionId,
          status: "paused" as const,
          executedAt: now(),
        } satisfies WorkflowExecutionModel);
      },
      async resume(_tenantId, executionId) {
        return Object.freeze({
          id: executionId,
          workflowId: executionId,
          status: "running" as const,
          executedAt: now(),
        } satisfies WorkflowExecutionModel);
      },
      async complete(_tenantId, executionId) {
        return Object.freeze({
          id: executionId,
          workflowId: executionId,
          status: "completed" as const,
          executedAt: now(),
        } satisfies WorkflowExecutionModel);
      },
      async cancel(_tenantId, executionId) {
        return Object.freeze({
          id: executionId,
          workflowId: executionId,
          status: "cancelled" as const,
          executedAt: now(),
        } satisfies WorkflowExecutionModel);
      },
    },
    knowledgeRead: {
      async getDocument(_tenantId, documentId) {
        return Object.freeze({
          id: documentId,
          title: "Mock Document",
          updatedAt: now(),
        });
      },
      async search(_tenantId, query) {
        return Object.freeze({
          query,
          documents: Object.freeze([]),
          chunks: Object.freeze([]),
          confidence: 0,
        });
      },
    },
    knowledgeWrite: {
      async publishDocument(input) {
        return Object.freeze({
          id: input.documentId,
          title: input.title,
          updatedAt: now(),
        });
      },
    },
    schedulingQuery: {
      async searchAvailability(input) {
        return Object.freeze({
          success: true,
          serviceId: input.serviceId,
          durationMinutes: 30,
          availableDates: Object.freeze([]),
          resources: Object.freeze([]),
        });
      },
      async findNextAvailable(input) {
        return Object.freeze({
          success: false,
          searchedWindow: input.daysAhead ?? 7,
          slot: null,
          message: "No slots in mock",
        });
      },
      async recommendAppointment(input) {
        return Object.freeze({
          success: false,
          searchedWindow: input.daysAhead ?? 7,
          recommendations: Object.freeze([]),
          alternativeResource: null,
          alternativeBranch: null,
          nearestDate: null,
        });
      },
    },
    ticketRead: {
      async getById(_tenantId, ticketId) {
        return Object.freeze({
          id: ticketId,
          tenantId: _tenantId,
          ticketNumber: "MOCK-1",
          subject: "Mock",
          description: "",
          status: "open" as const,
          priority: "normal" as const,
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: now(),
          updatedAt: now(),
          closedAt: null,
        });
      },
      async search() {
        return { tickets: [], total: 0 };
      },
    },
    ticketWrite: {
      async create(input) {
        return Object.freeze({
          id: `ticket_${randomId()}`,
          tenantId: input.tenantId,
          ticketNumber: "MOCK-1",
          subject: input.subject,
          description: input.description ?? "",
          status: "open" as const,
          priority: input.priority ?? ("normal" as const),
          customerId: input.customerId ?? null,
          conversationId: input.conversationId ?? null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: now(),
          updatedAt: now(),
          closedAt: null,
        });
      },
      async update(_tenantId, ticketId, patch) {
        return Object.freeze({
          id: ticketId,
          tenantId: _tenantId,
          ticketNumber: "MOCK-1",
          subject: patch.subject ?? "Mock",
          description: patch.description ?? "",
          status: "open" as const,
          priority: "normal" as const,
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: now(),
          updatedAt: now(),
          closedAt: null,
        });
      },
      async close(_tenantId, ticketId) {
        return Object.freeze({
          id: ticketId,
          tenantId: _tenantId,
          ticketNumber: "MOCK-1",
          subject: "Mock",
          description: "",
          status: "closed" as const,
          priority: "normal" as const,
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: now(),
          updatedAt: now(),
          closedAt: now(),
        });
      },
      async assign(_tenantId, ticketId) {
        return Object.freeze({
          id: ticketId,
          tenantId: _tenantId,
          ticketNumber: "MOCK-1",
          subject: "Mock",
          description: "",
          status: "open" as const,
          priority: "normal" as const,
          customerId: null,
          conversationId: null,
          assignedUserId: "user_mock",
          assignedUserName: "Mock Agent",
          createdAt: now(),
          updatedAt: now(),
          closedAt: null,
        });
      },
      async addComment(_tenantId, ticketId) {
        return Object.freeze({ commentId: randomId(), ticketId });
      },
      async changePriority(_tenantId, ticketId, input) {
        return Object.freeze({
          id: ticketId,
          tenantId: _tenantId,
          ticketNumber: "MOCK-1",
          subject: "Mock",
          description: "",
          status: "open" as const,
          priority: input.priority,
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: now(),
          updatedAt: now(),
          closedAt: null,
        });
      },
      async changeStatus(_tenantId, ticketId, input) {
        return Object.freeze({
          id: ticketId,
          tenantId: _tenantId,
          ticketNumber: "MOCK-1",
          subject: "Mock",
          description: "",
          status: input.status,
          priority: "normal" as const,
          customerId: null,
          conversationId: null,
          assignedUserId: null,
          assignedUserName: null,
          createdAt: now(),
          updatedAt: now(),
          closedAt: null,
        });
      },
    },
    handoffWrite: {
      async escalateToHuman(input) {
        return Object.freeze({
          requestId: randomId(),
          ownership: Object.freeze({ ownerType: "human", ownerLabel: "Support" }),
        });
      },
      async queueForHuman() {
        return Object.freeze({ queuePosition: 1, estimatedWaitSeconds: 60 });
      },
      async returnToAi() {
        return Object.freeze({ ownership: Object.freeze({ ownerType: "ai" }) });
      },
    },
    operationsWorkspaceRead: {
      async getConfig(tenantId, templateKey) {
        return Object.freeze({
          id: `cfg_${templateKey}`,
          companyId: tenantId,
          templateKey,
          config: Object.freeze({ templateKey, workspaceName: "Operations" }),
          updatedAt: now(),
        });
      },
    },
    configurationRead: {
      async get(tenantId, domain, scopeKey = "default") {
        return mockConfigurations.get(`${tenantId}:${domain}:${scopeKey}`) ?? null;
      },
      async getPublished(tenantId, domain, scopeKey = "default") {
        const record = mockConfigurations.get(`${tenantId}:${domain}:${scopeKey}`);
        return record ? Object.freeze({ ...record, draftConfig: null }) : null;
      },
      async listVersions(_tenantId, _configurationId) {
        return Object.freeze([]);
      },
      async getVersion() {
        return null;
      },
    },
    configurationWrite: {
      async saveDraft(input) {
        const key = `${input.tenantId}:${input.domain}:${input.scopeKey}`;
        const existing = mockConfigurations.get(key);
        const record = Object.freeze({
          id: existing?.id ?? randomId(),
          tenantId: input.tenantId,
          domain: input.domain,
          scopeKey: input.scopeKey,
          status: "draft" as const,
          version: existing?.version ?? 1,
          publishedConfig: existing?.publishedConfig ?? Object.freeze({}),
          draftConfig: Object.freeze({ ...input.config }),
          publishedAt: existing?.publishedAt ?? null,
          publishedBy: existing?.publishedBy ?? null,
          updatedAt: now(),
          updatedBy: input.actorId,
        });
        mockConfigurations.set(key, record);
        return record;
      },
      async publish(input) {
        const key = `${input.tenantId}:${input.domain}:${input.scopeKey}`;
        const existing = mockConfigurations.get(key);
        const config = existing?.draftConfig ?? existing?.publishedConfig ?? {};
        const record = Object.freeze({
          id: existing?.id ?? randomId(),
          tenantId: input.tenantId,
          domain: input.domain,
          scopeKey: input.scopeKey,
          status: "published" as const,
          version: (existing?.version ?? 0) + 1,
          publishedConfig: Object.freeze({ ...config }),
          draftConfig: null,
          publishedAt: now(),
          publishedBy: input.actorId,
          updatedAt: now(),
          updatedBy: input.actorId,
        });
        mockConfigurations.set(key, record);
        return record;
      },
      async rollback(input) {
        const existing = [...mockConfigurations.values()].find((r) => r.id === input.configurationId);
        if (!existing) throw new Error("Configuration not found");
        const record = Object.freeze({
          ...existing,
          version: input.targetVersion,
          publishedAt: now(),
          publishedBy: input.actorId,
          updatedAt: now(),
          updatedBy: input.actorId,
        });
        mockConfigurations.set(`${existing.tenantId}:${existing.domain}:${existing.scopeKey}`, record);
        return record;
      },
    },
    configurationCache: createConfigurationCachePort(),
    featureFlagRead: {
      async listApplicable(tenantId, context) {
        return listMockFeatureFlagRows(tenantId, context);
      },
      async resolve(tenantId, featureKey, context) {
        const rows = listMockFeatureFlagRows(tenantId, context);
        return featureFlagEngine.resolve(featureKey, rows, { ...context, companyId: tenantId });
      },
      async resolveMany(tenantId, featureKeys, context) {
        const rows = listMockFeatureFlagRows(tenantId, context);
        return featureFlagEngine.resolveMany(featureKeys, rows, { ...context, companyId: tenantId });
      },
    },
    featureFlagWrite: {
      async upsert(input) {
        const record = Object.freeze({
          id: randomId(),
          featureKey: input.featureKey,
          scopeType: input.scopeType,
          scopeId: input.scopeId ?? null,
          enabled: input.enabled,
          rolloutPercentage: input.rolloutPercentage ?? 100,
          environment: input.environment ?? "all",
          activatesAt: input.activatesAt ?? null,
          expiresAt: input.expiresAt ?? null,
          prerequisites: Object.freeze(input.prerequisites ?? []),
          priority: input.priority ?? 0,
          updatedAt: now(),
        });
        mockFeatureFlags.set(featureFlagKey(input), record);
        return record;
      },
    },
    licenseRead: {
      async getCompanyLicense(tenantId) {
        return mockCompanyLicenses.get(tenantId) ?? seedLicense(tenantId);
      },
      async getPlanEntitlements(planCode) {
        return mockPlanEntitlements.get(planCode) ?? defaultPlanEntitlements(planCode);
      },
      async canAccess(tenantId, featureKey) {
        const state = mockCompanyLicenses.get(tenantId) ?? seedLicense(tenantId);
        const entitlements = mockPlanEntitlements.get(state.planCode) ?? defaultPlanEntitlements(state.planCode);
        return licensingEngine.canAccess(featureKey, entitlements, state);
      },
      async getQuota(tenantId, quotaKey) {
        const state = mockCompanyLicenses.get(tenantId) ?? seedLicense(tenantId);
        const entitlements = mockPlanEntitlements.get(state.planCode) ?? defaultPlanEntitlements(state.planCode);
        return licensingEngine.getQuota(quotaKey, entitlements, state);
      },
    },
    licenseWrite: {
      async assignPlan(input) {
        const record = Object.freeze({
          tenantId: input.tenantId,
          planCode: input.planCode,
          status: (input.status ?? "active") as CompanyLicenseState["status"],
          trialEndsAt: input.trialEndsAt ?? null,
          expiresAt: input.expiresAt ?? null,
          graceEndsAt: input.graceEndsAt ?? null,
          addOns: Object.freeze(input.addOns ?? []),
        });
        mockCompanyLicenses.set(input.tenantId, record);
        mockPlanEntitlements.set(input.planCode, defaultPlanEntitlements(input.planCode));
        return record;
      },
    },
    analyticsRead: {
      async getMetrics(_tenantId, _templateKey, metrics) {
        const all = [
          Object.freeze({ id: "finance.revenue.today", label: "Today's Revenue", value: "$4,200", trend: "+8%" }),
          Object.freeze({ id: "bookings.today", label: "Bookings Today", value: "12", trend: "+2" }),
          Object.freeze({ id: "finance.outstanding", label: "Outstanding", value: "$1,800", trend: "-3%" }),
          Object.freeze({ id: "operations.utilization", label: "Utilization", value: "78%", trend: "+5%" }),
        ];
        if (!metrics?.length) return all;
        return all.filter((m) => metrics.includes(m.id));
      },
      async getExecutiveSnapshot(_tenantId, filter) {
        return Object.freeze({
          capturedAt: now(),
          currency: "USD",
          kpis: Object.freeze([
            Object.freeze({ key: "finance.revenue.today", label: "Today's Revenue", value: 420_000, unit: "currency" as const, previousValue: 390_000, trend: "up" as const, category: "finance" }),
            Object.freeze({ key: "bookings.today", label: "Bookings Today", value: 12, unit: "count" as const, previousValue: 10, trend: "up" as const, category: "bookings" }),
            Object.freeze({ key: "finance.outstanding", label: "Outstanding Balance", value: 180_000, unit: "currency" as const, category: "finance" }),
            Object.freeze({ key: "operations.utilization", label: "Resource Utilization", value: 78, unit: "percent" as const, previousValue: 74, trend: "up" as const, category: "operations" }),
            Object.freeze({ key: "operations.no_show_rate", label: "No-show Rate", value: 6, unit: "percent" as const, category: "operations" }),
          ]),
          charts: Object.freeze({
            "finance.revenue": Object.freeze([
              Object.freeze({ label: "Mon", value: 3200 }),
              Object.freeze({ label: "Tue", value: 4100 }),
            ]),
            "crm.customers.new": Object.freeze([
              Object.freeze({ label: "Mon", value: 4 }),
              Object.freeze({ label: "Tue", value: 7 }),
            ]),
          }),
          rankings: Object.freeze({
            customers: Object.freeze([Object.freeze({ id: "c1", name: "Acme Corp", value: 120_000 })]),
            employees: Object.freeze([Object.freeze({ id: "e1", name: "Dr. Amira", value: 95_000 })]),
            services: Object.freeze([Object.freeze({ id: "s1", name: "Consultation", value: 80_000 })]),
            branches: Object.freeze([Object.freeze({ id: "b1", name: "Main", value: 200_000 })]),
          }),
          breakdowns: Object.freeze({
            revenueByBranch: Object.freeze([Object.freeze({ id: "b1", name: "Main", value: 200_000 })]),
            revenueByEmployee: Object.freeze([Object.freeze({ id: "e1", name: "Dr. Amira", value: 95_000 })]),
            revenueByService: Object.freeze([Object.freeze({ id: "s1", name: "Consultation", value: 80_000 })]),
            paymentMethods: Object.freeze([Object.freeze({ id: "cash", name: "Cash", value: 150_000, count: 8 })]),
          }),
        });
        void filter;
      },
    },
    employeeRead: {
      async getWorkload(_tenantId, employeeId, _date) {
        return Object.freeze({
          employeeId,
          employeeName: "Dr. Amira",
          bookingsToday: 4,
          hoursScheduled: 6,
          utilizationPercent: 75,
        } satisfies EmployeeWorkloadModel);
      },
      async listTopEmployees() {
        return Object.freeze([Object.freeze({ id: "e1", name: "Dr. Amira", value: 95_000, count: 4 })]);
      },
    },
    revenueRead: {
      async getSummary(_tenantId, period) {
        return Object.freeze({
          totalCents: 1_248_000,
          currency: "USD",
          period,
          trend: "+8%",
        } satisfies RevenueSummaryModel);
      },
      async getBreakdown() {
        return Object.freeze([Object.freeze({ id: "cash", name: "Cash", value: 150_000, count: 8 })]);
      },
    },
    entityContactRead: {
      async list(tenantId, entityType, entityId) {
        return [...entityContacts.values()].filter(
          (c) => c.tenantId === tenantId && c.entityType === entityType && c.entityId === entityId,
        );
      },
      async search(tenantId, query) {
        return [...entityContacts.values()].filter(
          (c) => c.tenantId === tenantId && c.displayName.toLowerCase().includes(query.toLowerCase()),
        );
      },
    },
    entityContactWrite: {
      async create(input) {
        const contact = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          contactType: input.contactType ?? "primary",
          displayName: input.displayName,
          emails: Object.freeze(input.emails ?? []),
          phones: Object.freeze(input.phones ?? []),
          whatsapp: input.whatsapp ?? null,
          preferredLanguage: input.preferredLanguage ?? null,
          preferredChannel: input.preferredChannel ?? null,
          notes: input.notes ?? null,
          avatarUrl: input.avatarUrl ?? null,
          status: "active",
          isPrimary: input.isPrimary ?? false,
          createdAt: now(),
          updatedAt: now(),
        });
        entityContacts.set(contact.id, contact);
        return contact;
      },
      async update(tenantId, contactId, input) {
        const existing = entityContacts.get(contactId);
        if (!existing || existing.tenantId !== tenantId) throw new Error("not found");
        const updated = Object.freeze({ ...existing, ...input, updatedAt: now() });
        entityContacts.set(contactId, updated);
        return updated;
      },
      async archive(tenantId, contactId) {
        const existing = entityContacts.get(contactId);
        if (existing?.tenantId === tenantId) entityContacts.delete(contactId);
      },
    },
    entityFileRead: {
      async list(tenantId, entityType, entityId) {
        return [...entityFiles.values()].filter(
          (f) => f.tenantId === tenantId && f.entityType === entityType && f.entityId === entityId,
        );
      },
      async search() { return []; },
    },
    entityFileWrite: {
      async create(input) {
        const file = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          activityId: input.activityId ?? null,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          category: input.category ?? null,
          storageProvider: input.storageProvider ?? "supabase",
          storagePath: input.storagePath,
          previewMetadata: Object.freeze(input.previewMetadata ?? {}),
          version: 1,
          uploadedAt: now(),
          previewUrl: null,
        });
        entityFiles.set(file.id, file);
        return file;
      },
      async archive(tenantId, fileId) {
        const existing = entityFiles.get(fileId);
        if (existing?.tenantId === tenantId) entityFiles.delete(fileId);
      },
    },
    entityTagRead: {
      async listDefinitions(tenantId) {
        return [...entityTags.values()].filter((t) => t.tenantId === tenantId);
      },
      async listForEntity(tenantId, entityType, entityId) {
        return [...entityTagAssignments.entries()]
          .filter(([, a]) => a.tenantId === tenantId && a.entityType === entityType && a.entityId === entityId)
          .map(([assignmentId, a]) => {
            const tag = entityTags.get(a.tagId);
            if (!tag) return null;
            return Object.freeze({ assignmentId, tag });
          })
          .filter((item): item is NonNullable<typeof item> => item != null);
      },
      async search(tenantId, query) {
        return [...entityTags.values()].filter(
          (t) => t.tenantId === tenantId && t.name.toLowerCase().includes(query.toLowerCase()),
        );
      },
    },
    entityTagWrite: {
      async createDefinition(input) {
        const tag = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          name: input.name,
          color: input.color ?? null,
          icon: input.icon ?? null,
          category: input.category ?? null,
          description: input.description ?? null,
          isSystem: input.isSystem ?? false,
        });
        entityTags.set(tag.id, tag);
        return tag;
      },
      async assign(tenantId, entityType, entityId, tagId) {
        entityTagAssignments.set(randomId(), { tenantId, entityType, entityId, tagId });
      },
      async unassign(tenantId, entityType, entityId, tagId) {
        for (const [key, value] of entityTagAssignments.entries()) {
          if (
            value.tenantId === tenantId &&
            value.entityType === entityType &&
            value.entityId === entityId &&
            value.tagId === tagId
          ) {
            entityTagAssignments.delete(key);
          }
        }
      },
    },
    entityCustomFieldRead: {
      async listDefinitions() { return []; },
      async listValues(_tenantId, _entityType, _entityId) {
        return [...entityCustomFieldValues.values()];
      },
      async search() { return []; },
    },
    entityCustomFieldWrite: {
      async upsertValue(input) {
        const value = Object.freeze({
          fieldId: input.fieldId,
          fieldKey: input.fieldId,
          label: input.fieldId,
          fieldType: "text",
          value: input.valueText ?? "",
        });
        entityCustomFieldValues.set(`${input.entityId}:${input.fieldId}`, value);
        return value;
      },
    },
    entityActivityRead: {
      async list(tenantId, entityType, entityId, filter) {
        const limit = filter?.limit ?? 50;
        return [...entityActivities.values()]
          .filter((a) => a.tenantId === tenantId && a.entityType === entityType && a.entityId === entityId)
          .slice(0, limit);
      },
      async search() { return []; },
    },
    entityActivityWrite: {
      async create(input) {
        const activity = Object.freeze({
          id: randomId(),
          tenantId: input.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          activityType: input.activityType,
          subject: input.subject,
          body: input.body ?? null,
          outcome: input.outcome ?? null,
          durationSeconds: input.durationSeconds ?? null,
          actorId: input.actorId ?? input.actorUserId,
          actorName: input.actorName ?? null,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          attachments: Object.freeze(input.attachments ?? []),
          occurredAt: input.occurredAt ?? now(),
          channel: input.activityType,
          preview: input.body?.slice(0, 240) ?? null,
        });
        entityActivities.set(activity.id, activity);
        return activity;
      },
    },
    entityRelationshipRead: {
      async listForEntity() {
        return [];
      },
    },
  };

  Object.assign(
    ports,
    createCustomerEntityFacadePorts({
      entityTagRead: ports.entityTagRead,
      entityContactRead: ports.entityContactRead,
      entityCustomFieldRead: ports.entityCustomFieldRead,
      entityFileRead: ports.entityFileRead,
      entityActivityRead: ports.entityActivityRead,
    }),
  );

  return Object.assign(ports, { _stores: { customers, bookings, leads, timeline } });
}
