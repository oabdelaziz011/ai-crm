import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";
import type {
  QuoteApprovalReadModel,
  QuoteHistoryReadModel,
  QuoteLineItemReadModel,
  QuoteListFilter,
  QuoteReadModel,
  QuoteTemplateReadModel,
} from "../ports/repository-ports.js";

export class QuoteApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getQuote(
    quoteId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<QuoteReadModel | null>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "QuoteGet",
      request: { quoteId },
      context,
      requiredPermissions: ["quotes.view"],
      handler: async (req, ctx) => this.deps.ports.quoteRead.getById(ctx.tenantId, req.quoteId),
    });
  }

  listQuotes(
    request: QuoteListFilter,
    context: ApplicationContext,
  ): Promise<QueryResult<{ items: readonly QuoteReadModel[]; total: number }>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "QuoteList",
      request,
      context,
      requiredPermissions: ["quotes.view"],
      handler: async (req, ctx) => this.deps.ports.quoteRead.list(ctx.tenantId, req),
    });
  }

  listLines(
    quoteId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<QuoteLineItemReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "QuoteLines",
      request: { quoteId },
      context,
      requiredPermissions: ["quotes.view"],
      handler: async (req, ctx) => this.deps.ports.quoteRead.listLines(ctx.tenantId, req.quoteId),
    });
  }

  listVersions(
    quoteFamilyId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<QuoteReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "QuoteVersions",
      request: { quoteFamilyId },
      context,
      requiredPermissions: ["quotes.view"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteRead.listVersions(ctx.tenantId, req.quoteFamilyId),
    });
  }

  listTemplates(context: ApplicationContext): Promise<QueryResult<QuoteTemplateReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "QuoteTemplates",
      request: {},
      context,
      requiredPermissions: ["quotes.view"],
      handler: async (_req, ctx) => this.deps.ports.quoteRead.listTemplates(ctx.tenantId),
    });
  }

  listApprovals(
    quoteId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<QuoteApprovalReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "QuoteApprovals",
      request: { quoteId },
      context,
      requiredPermissions: ["quotes.view"],
      handler: async (req, ctx) => this.deps.ports.quoteRead.listApprovals(ctx.tenantId, req.quoteId),
    });
  }

  listHistory(
    quoteId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<QuoteHistoryReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "QuoteHistory",
      request: { quoteId },
      context,
      requiredPermissions: ["quotes.view"],
      handler: async (req, ctx) => this.deps.ports.quoteRead.listHistory(ctx.tenantId, req.quoteId),
    });
  }

  createFromOpportunity(
    request: { opportunityId: string; templateId?: string | null; title?: string },
    context: ApplicationContext,
  ): Promise<CommandResult<{ quote: QuoteReadModel; lines: QuoteLineItemReadModel[] }>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "CreateQuoteFromOpportunity",
      request,
      context,
      requiredPermissions: ["quotes.create"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.createFromOpportunity({
          tenantId: ctx.tenantId,
          opportunityId: req.opportunityId,
          templateId: req.templateId,
          title: req.title,
          actorUserId: ctx.actorId,
        }),
    });
  }

  createQuote(
    request: {
      title: string;
      opportunityId?: string;
      templateId?: string | null;
      currency?: string;
      contactName?: string;
    },
    context: ApplicationContext,
  ): Promise<CommandResult<QuoteReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "CreateQuote",
      request,
      context,
      requiredPermissions: ["quotes.create"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.createManual({
          tenantId: ctx.tenantId,
          title: req.title,
          opportunityId: req.opportunityId,
          templateId: req.templateId,
          currency: req.currency,
          contactName: req.contactName,
          actorUserId: ctx.actorId,
        }),
    });
  }

  createVersion(
    request: { quoteId: string },
    context: ApplicationContext,
  ): Promise<CommandResult<QuoteReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "CreateQuoteVersion",
      request,
      context,
      requiredPermissions: ["quotes.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.createVersion({
          tenantId: ctx.tenantId,
          quoteId: req.quoteId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  addCatalogProduct(
    request: {
      quoteId: string;
      productId: string;
      quantity?: number;
      discountPercent?: number;
      taxPercent?: number;
    },
    context: ApplicationContext,
  ): Promise<CommandResult<{ line: QuoteLineItemReadModel; quote: QuoteReadModel }>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "AddQuoteProduct",
      request,
      context,
      requiredPermissions: ["quotes.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.addCatalogProduct({
          tenantId: ctx.tenantId,
          quoteId: req.quoteId,
          productId: req.productId,
          quantity: req.quantity,
          discountPercent: req.discountPercent,
          taxPercent: req.taxPercent,
          actorUserId: ctx.actorId,
        }),
    });
  }

  updateLine(
    request: {
      quoteId: string;
      lineId: string;
      quantity?: number;
      unitPrice?: number;
      discountPercent?: number;
      discountAmount?: number;
      taxPercent?: number;
    },
    context: ApplicationContext,
  ): Promise<CommandResult<{ line: QuoteLineItemReadModel; quote: QuoteReadModel }>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "UpdateQuoteLine",
      request,
      context,
      requiredPermissions: ["quotes.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.updateLine({
          tenantId: ctx.tenantId,
          quoteId: req.quoteId,
          lineId: req.lineId,
          quantity: req.quantity,
          unitPrice: req.unitPrice,
          discountPercent: req.discountPercent,
          discountAmount: req.discountAmount,
          taxPercent: req.taxPercent,
          actorUserId: ctx.actorId,
        }),
    });
  }

  removeLine(
    request: { quoteId: string; lineId: string },
    context: ApplicationContext,
  ): Promise<CommandResult<QuoteReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "RemoveQuoteLine",
      request,
      context,
      requiredPermissions: ["quotes.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.removeLine({
          tenantId: ctx.tenantId,
          quoteId: req.quoteId,
          lineId: req.lineId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  changeStatus(
    request: { quoteId: string; status: string },
    context: ApplicationContext,
  ): Promise<CommandResult<QuoteReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "ChangeQuoteStatus",
      request,
      context,
      requiredPermissions: request.status === "sent" ? ["quotes.send"] : ["quotes.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.changeStatus({
          tenantId: ctx.tenantId,
          quoteId: req.quoteId,
          status: req.status,
          actorUserId: ctx.actorId,
        }),
    });
  }

  requestApproval(
    request: { quoteId: string },
    context: ApplicationContext,
  ): Promise<CommandResult<QuoteReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "RequestQuoteApproval",
      request,
      context,
      requiredPermissions: ["quotes.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.requestApproval({
          tenantId: ctx.tenantId,
          quoteId: req.quoteId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  decideApproval(
    request: {
      quoteId: string;
      approvalId: string;
      status: "approved" | "rejected";
      decisionNote?: string;
    },
    context: ApplicationContext,
  ): Promise<CommandResult<QuoteReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "DecideQuoteApproval",
      request,
      context,
      requiredPermissions: ["quotes.approve"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.decideApproval({
          tenantId: ctx.tenantId,
          quoteId: req.quoteId,
          approvalId: req.approvalId,
          status: req.status,
          decisionNote: req.decisionNote,
          actorUserId: ctx.actorId,
        }),
    });
  }

  archive(
    request: { quoteId: string },
    context: ApplicationContext,
  ): Promise<CommandResult<void>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "ArchiveQuote",
      request,
      context,
      requiredPermissions: ["quotes.delete"],
      handler: async (req, ctx) =>
        this.deps.ports.quoteWrite.archive({
          tenantId: ctx.tenantId,
          quoteId: req.quoteId,
          actorUserId: ctx.actorId,
        }),
    });
  }
}
