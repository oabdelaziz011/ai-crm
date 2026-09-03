import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteReadPort, QuoteWritePort } from "@workspace/application-layer";
import type { QuoteServiceContext, QuoteStatus } from "@workspace/quote-platform";
import type { LoginAppPortContext } from "../application-layer/adapters/customer-read-port-adapter.js";
import {
  createLoginAppQuotePlatformServices,
  mapQuote,
  mapQuoteLine,
} from "./quote-platform-factory.js";

function buildContext(ctx: LoginAppPortContext, tenantId: string): QuoteServiceContext {
  return {
    userId: ctx.actorUserId,
    companyId: tenantId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
  };
}

export function createLoginAppQuoteReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): QuoteReadPort {
  const platform = createLoginAppQuotePlatformServices(client);
  const assertTenant = (tenantId: string) => {
    if (tenantId !== ctx.companyId && !ctx.isSuperAdmin) throw new Error("Permission denied");
  };

  return {
    async getById(tenantId, quoteId) {
      assertTenant(tenantId);
      const record = await platform.queries.getQuote(buildContext(ctx, tenantId), tenantId, quoteId);
      return record ? mapQuote(record) : null;
    },
    async list(tenantId, filter) {
      assertTenant(tenantId);
      const result = await platform.queries.listQuotes(buildContext(ctx, tenantId), {
        companyId: tenantId,
        opportunityId: filter?.opportunityId,
        status: filter?.status as QuoteStatus | undefined,
        currentOnly: filter?.currentOnly,
        limit: filter?.limit,
        offset: filter?.offset,
      });
      return {
        items: Object.freeze(result.items.map(mapQuote)),
        total: result.total,
      };
    },
    async listLines(tenantId, quoteId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listLines(buildContext(ctx, tenantId), tenantId, quoteId);
      return rows.map(mapQuoteLine);
    },
    async listVersions(tenantId, quoteFamilyId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listVersions(
        buildContext(ctx, tenantId),
        tenantId,
        quoteFamilyId,
      );
      return rows.map(mapQuote);
    },
    async listTemplates(tenantId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listTemplates(buildContext(ctx, tenantId), tenantId);
      return rows.map((t) =>
        Object.freeze({
          id: t.id,
          tenantId: t.companyId,
          name: t.name,
          slug: t.slug,
          description: t.description,
          defaultLanguage: t.defaultLanguage,
          defaultCurrency: t.defaultCurrency,
          validityDays: t.validityDays,
          isActive: t.isActive,
        }),
      );
    },
    async listApprovals(tenantId, quoteId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listApprovals(
        buildContext(ctx, tenantId),
        tenantId,
        quoteId,
      );
      return rows.map((a) =>
        Object.freeze({
          id: a.id,
          quoteId: a.quoteId,
          status: a.status,
          requestedBy: a.requestedBy,
          decidedBy: a.decidedBy,
          decisionNote: a.decisionNote,
          requestedAt: a.requestedAt,
          decidedAt: a.decidedAt,
        }),
      );
    },
    async listHistory(tenantId, quoteId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listHistory(buildContext(ctx, tenantId), tenantId, quoteId);
      return rows.map((h) =>
        Object.freeze({
          id: h.id,
          quoteId: h.quoteId,
          eventType: h.eventType,
          summary: h.summary,
          fieldName: h.fieldName,
          previousValue: h.previousValue,
          newValue: h.newValue,
          createdAt: h.createdAt,
        }),
      );
    },
  };
}

export function createLoginAppQuoteWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): QuoteWritePort {
  const platform = createLoginAppQuotePlatformServices(client);
  const assertTenant = (tenantId: string) => {
    if (tenantId !== ctx.companyId && !ctx.isSuperAdmin) throw new Error("Permission denied");
  };

  return {
    async createFromOpportunity(input) {
      assertTenant(input.tenantId);
      const result = await platform.commands.createFromOpportunity(
        buildContext(ctx, input.tenantId),
        {
          companyId: input.tenantId,
          opportunityId: input.opportunityId,
          templateId: input.templateId,
          title: input.title,
        },
      );
      return {
        quote: mapQuote(result.quote),
        lines: result.lines.map(mapQuoteLine),
      };
    },
    async createManual(input) {
      assertTenant(input.tenantId);
      const { quote } = await platform.commands.createManual(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        title: input.title,
        opportunityId: input.opportunityId,
        templateId: input.templateId,
        currency: input.currency,
        contactName: input.contactName,
      });
      return mapQuote(quote);
    },
    async createVersion(input) {
      assertTenant(input.tenantId);
      const { quote } = await platform.commands.createVersion(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
      });
      return mapQuote(quote);
    },
    async addCatalogProduct(input) {
      assertTenant(input.tenantId);
      const result = await platform.commands.addCatalogProduct(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
        productId: input.productId,
        quantity: input.quantity,
        discountPercent: input.discountPercent,
        taxPercent: input.taxPercent,
      });
      return { line: mapQuoteLine(result.line), quote: mapQuote(result.quote) };
    },
    async updateLine(input) {
      assertTenant(input.tenantId);
      const result = await platform.commands.updateLine(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
        lineId: input.lineId,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        discountPercent: input.discountPercent,
        discountAmount: input.discountAmount,
        taxPercent: input.taxPercent,
      });
      return { line: mapQuoteLine(result.line), quote: mapQuote(result.quote) };
    },
    async removeLine(input) {
      assertTenant(input.tenantId);
      const { quote } = await platform.commands.removeLine(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
        lineId: input.lineId,
      });
      return mapQuote(quote);
    },
    async updateDetails(input) {
      assertTenant(input.tenantId);
      const { quote } = await platform.commands.updateDetails(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
        language: input.language,
        title: input.title,
        notes: input.notes,
        contactName: input.contactName,
      });
      return mapQuote(quote);
    },
    async changeStatus(input) {
      assertTenant(input.tenantId);
      const { quote } = await platform.commands.changeStatus(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
        status: input.status as QuoteStatus,
      });
      return mapQuote(quote);
    },
    async requestApproval(input) {
      assertTenant(input.tenantId);
      const { quote } = await platform.commands.requestApproval(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
      });
      return mapQuote(quote);
    },
    async decideApproval(input) {
      assertTenant(input.tenantId);
      const { quote } = await platform.commands.decideApproval(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
        approvalId: input.approvalId,
        status: input.status,
        decisionNote: input.decisionNote,
      });
      return mapQuote(quote);
    },
    async archive(input) {
      assertTenant(input.tenantId);
      await platform.commands.archive(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        quoteId: input.quoteId,
      });
    },
  };
}
