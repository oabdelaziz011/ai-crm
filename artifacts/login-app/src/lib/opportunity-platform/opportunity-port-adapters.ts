import { getCompanyCurrency } from "@/lib/company-locale/runtime";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OpportunityReadPort,
  OpportunityWritePort,
} from "@workspace/application-layer";
import type { OpportunityServiceContext } from "@workspace/opportunity-platform";
import type { LoginAppPortContext } from "../adapters/customer-read-port-adapter.js";
import {
  createLoginAppOpportunityPlatformServices,
  mapOpportunityRecordToReadModel,
} from "./opportunity-platform-factory.js";

function buildContext(ctx: LoginAppPortContext, tenantId: string): OpportunityServiceContext {
  return {
    userId: ctx.actorUserId,
    companyId: tenantId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
  };
}

export function createLoginAppOpportunityReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): OpportunityReadPort {
  const platform = createLoginAppOpportunityPlatformServices(client);

  const assertTenant = (tenantId: string) => {
    if (tenantId !== ctx.companyId && !ctx.isSuperAdmin) throw new Error("Permission denied");
  };

  return {
    async getById(tenantId, opportunityId) {
      assertTenant(tenantId);
      const record = await platform.queries.getById(buildContext(ctx, tenantId), tenantId, opportunityId);
      if (!record) return null;
      return mapOpportunityRecordToReadModel(client, tenantId, record);
    },
    async list(tenantId, filter) {
      assertTenant(tenantId);
      const result = await platform.queries.list(buildContext(ctx, tenantId), {
        companyId: tenantId,
        ...filter,
      });
      const items = await Promise.all(
        result.items.map((row) => mapOpportunityRecordToReadModel(client, tenantId, row)),
      );
      return { items: Object.freeze(items), total: result.total };
    },
    async listPipelines(tenantId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listPipelines(buildContext(ctx, tenantId), tenantId);
      return rows.map((p) =>
        Object.freeze({
          id: p.id,
          tenantId: p.companyId,
          name: p.name,
          slug: p.slug,
          isDefault: p.isDefault,
          isActive: p.isActive,
        }),
      );
    },
    async listStages(tenantId, pipelineId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listStages(buildContext(ctx, tenantId), tenantId, pipelineId);
      return rows.map((s) =>
        Object.freeze({
          id: s.id,
          tenantId: s.companyId,
          pipelineId: s.pipelineId,
          name: s.name,
          slug: s.slug,
          stageKey: s.stageKey,
          sortOrder: s.sortOrder,
          defaultProbabilityPercent: s.defaultProbabilityPercent,
          isTerminal: s.isTerminal,
        }),
      );
    },
    async getPipelineBoard(tenantId, pipelineId) {
      assertTenant(tenantId);
      const board = await platform.queries.getPipelineBoard(
        buildContext(ctx, tenantId),
        tenantId,
        pipelineId,
      );
      const stages = await Promise.all(
        board.stages.map(async (stage) => {
          const opportunities = await Promise.all(
            stage.opportunities.map((o) => mapOpportunityRecordToReadModel(client, tenantId, o)),
          );
          return Object.freeze({
            id: stage.id,
            tenantId: stage.companyId,
            pipelineId: stage.pipelineId,
            name: stage.name,
            slug: stage.slug,
            stageKey: stage.stageKey,
            sortOrder: stage.sortOrder,
            defaultProbabilityPercent: stage.defaultProbabilityPercent,
            isTerminal: stage.isTerminal,
            opportunities: Object.freeze(opportunities),
          });
        }),
      );
      return Object.freeze({ pipelineId: board.pipelineId, stages: Object.freeze(stages) });
    },
    async listHistory(tenantId, opportunityId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listHistory(
        buildContext(ctx, tenantId),
        tenantId,
        opportunityId,
      );
      return rows.map((h) =>
        Object.freeze({
          id: h.id,
          opportunityId: h.opportunityId,
          eventType: h.eventType,
          fieldName: h.fieldName,
          previousValue: h.previousValue,
          newValue: h.newValue,
          summary: h.summary,
          actorUserId: h.actorUserId,
          createdAt: h.createdAt,
        }),
      );
    },
  };
}

export function createLoginAppOpportunityWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): OpportunityWritePort {
  const platform = createLoginAppOpportunityPlatformServices(client);

  const assertTenant = (tenantId: string) => {
    if (tenantId !== ctx.companyId && !ctx.isSuperAdmin) throw new Error("Permission denied");
  };

  const map = (tenantId: string, record: Parameters<typeof mapOpportunityRecordToReadModel>[2]) =>
    mapOpportunityRecordToReadModel(client, tenantId, record);

  const companyCurrency = () => getCompanyCurrency();

  return {
    async create(input) {
      assertTenant(input.tenantId);
      const billingCurrency = companyCurrency();
      const { opportunity } = await platform.commands.createManual(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        name: input.name,
        companyName: input.companyName,
        primaryContactName: input.primaryContactName,
        ownerUserId: input.ownerUserId,
        expectedRevenue: input.expectedRevenue,
        currency: input.currency || billingCurrency,
        companyDefaultCurrency: billingCurrency,
        expectedCloseDate: input.expectedCloseDate,
        stageId: input.stageId,
        pipelineId: input.pipelineId,
        country: input.country,
        market: input.market,
        language: input.language,
        leadId: input.leadId,
        customerId: input.customerId,
        probabilityPercent: input.probabilityPercent,
        probabilitySource: input.probabilitySource,
        probabilityReason: input.probabilityReason,
        metadata: input.metadata ? { ...input.metadata } : undefined,
      });
      return map(input.tenantId, opportunity);
    },
    async createFromLead(input) {
      assertTenant(input.tenantId);
      const billingCurrency = companyCurrency();
      const { opportunity } = await platform.commands.createFromLead(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        leadId: input.leadId,
        name: input.name,
        companyName: input.companyName,
        primaryContactName: input.primaryContactName,
        ownerUserId: input.ownerUserId,
        expectedRevenue: input.expectedRevenue,
        currency: input.currency || billingCurrency,
        companyDefaultCurrency: billingCurrency,
        expectedCloseDate: input.expectedCloseDate,
        stageId: input.stageId,
        pipelineId: input.pipelineId,
        forceCreate: input.forceCreate,
        probabilityPercent: input.probabilityPercent,
        probabilitySource: input.probabilitySource,
        probabilityReason: input.probabilityReason,
        metadata: input.metadata ? { ...input.metadata } : undefined,
      });
      return map(input.tenantId, opportunity);
    },
    async update(tenantId, opportunityId, patch) {
      assertTenant(tenantId);
      const { opportunity } = await platform.commands.updateFields(buildContext(ctx, tenantId), {
        companyId: tenantId,
        opportunityId,
        name: patch.name,
        expectedRevenue: patch.expectedRevenue,
        currency: patch.currency,
        expectedCloseDate: patch.expectedCloseDate,
        ownerUserId: patch.ownerUserId,
        companyName: patch.companyName,
        primaryContactName: patch.primaryContactName,
        country: patch.country,
        market: patch.market,
      });
      return map(tenantId, opportunity);
    },
    async changeStage(tenantId, opportunityId, stageId) {
      assertTenant(tenantId);
      const { opportunity } = await platform.commands.changeStage(buildContext(ctx, tenantId), {
        companyId: tenantId,
        opportunityId,
        stageId,
      });
      return map(tenantId, opportunity);
    },
    async updateProbability(tenantId, opportunityId, input) {
      assertTenant(tenantId);
      const { opportunity } = await platform.commands.updateProbability(buildContext(ctx, tenantId), {
        companyId: tenantId,
        opportunityId,
        percent: input.percent,
        confidence: input.confidence,
        source: input.source,
        reason: input.reason,
      });
      return map(tenantId, opportunity);
    },
    async archive(tenantId, opportunityId) {
      assertTenant(tenantId);
      await platform.commands.archive(buildContext(ctx, tenantId), {
        companyId: tenantId,
        opportunityId,
      });
    },
  };
}
