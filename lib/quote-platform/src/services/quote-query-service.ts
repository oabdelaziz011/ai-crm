import { QUOTE_PERMISSIONS } from "../constants.js";
import { QuotePermissionError } from "../errors.js";
import type { QuoteRepository } from "../repositories/quote-repository-port.js";
import type {
  QuoteApprovalRecord,
  QuoteHistoryRecord,
  QuoteLineItemRecord,
  QuoteRecord,
  QuoteServiceContext,
  QuoteStatus,
  QuoteTemplateRecord,
} from "../types.js";

function assertCompany(ctx: QuoteServiceContext, companyId: string) {
  if (!ctx.isSuperAdmin && ctx.companyId !== companyId) {
    throw new QuotePermissionError("tenant");
  }
}

function assertPermission(ctx: QuoteServiceContext, code: string) {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(code)) throw new QuotePermissionError(code);
}

export class QuoteQueryService {
  constructor(private readonly deps: { quotes: QuoteRepository }) {}

  async getQuote(
    ctx: QuoteServiceContext,
    companyId: string,
    quoteId: string,
  ): Promise<QuoteRecord | null> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.view);
    return this.deps.quotes.getQuote(companyId, quoteId);
  }

  async listQuotes(
    ctx: QuoteServiceContext,
    input: {
      companyId: string;
      opportunityId?: string;
      status?: QuoteStatus;
      currentOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: QuoteRecord[]; total: number }> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.view);
    return this.deps.quotes.listQuotes({
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      status: input.status,
      currentOnly: input.currentOnly,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });
  }

  async listLines(
    ctx: QuoteServiceContext,
    companyId: string,
    quoteId: string,
  ): Promise<QuoteLineItemRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.view);
    return this.deps.quotes.listLines(companyId, quoteId);
  }

  async listVersions(
    ctx: QuoteServiceContext,
    companyId: string,
    quoteFamilyId: string,
  ): Promise<QuoteRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.view);
    return this.deps.quotes.listVersions(companyId, quoteFamilyId);
  }

  async listTemplates(
    ctx: QuoteServiceContext,
    companyId: string,
  ): Promise<QuoteTemplateRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.view);
    await this.deps.quotes.ensureDefaultTemplates(companyId);
    return this.deps.quotes.listTemplates(companyId);
  }

  async listApprovals(
    ctx: QuoteServiceContext,
    companyId: string,
    quoteId: string,
  ): Promise<QuoteApprovalRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.view);
    return this.deps.quotes.listApprovals(companyId, quoteId);
  }

  async listHistory(
    ctx: QuoteServiceContext,
    companyId: string,
    quoteId: string,
  ): Promise<QuoteHistoryRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, QUOTE_PERMISSIONS.view);
    return this.deps.quotes.listHistory(companyId, quoteId);
  }
}
