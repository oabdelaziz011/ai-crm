import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";
import type {
  AttachProductToOpportunityInput,
  CatalogProductReadModel,
  OpportunityLineItemReadModel,
  ProductCategoryCreateInput,
  ProductCategoryReadModel,
  ProductCreateInput,
  ProductHistoryReadModel,
  ProductListFilter,
  ProductRegionalPriceInput,
  ProductRegionalPriceReadModel,
  ProductUpdateInput,
  UpdateOpportunityLineInput,
} from "../ports/repository-ports.js";

export class ProductApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getProduct(
    productId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<CatalogProductReadModel | null>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ProductGet",
      request: { productId },
      context,
      requiredPermissions: ["products.view"],
      handler: async (req, ctx) => this.deps.ports.productRead.getById(ctx.tenantId, req.productId),
    });
  }

  listProducts(
    request: ProductListFilter,
    context: ApplicationContext,
  ): Promise<QueryResult<{ items: readonly CatalogProductReadModel[]; total: number }>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ProductList",
      request,
      context,
      requiredPermissions: ["products.view"],
      handler: async (req, ctx) => this.deps.ports.productRead.list(ctx.tenantId, req),
    });
  }

  listCategories(context: ApplicationContext): Promise<QueryResult<ProductCategoryReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ProductCategories",
      request: {},
      context,
      requiredPermissions: ["products.view"],
      handler: async (_req, ctx) => this.deps.ports.productRead.listCategories(ctx.tenantId),
    });
  }

  listRegionalPrices(
    productId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<ProductRegionalPriceReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ProductRegionalPrices",
      request: { productId },
      context,
      requiredPermissions: ["products.view"],
      handler: async (req, ctx) =>
        this.deps.ports.productRead.listRegionalPrices(ctx.tenantId, req.productId),
    });
  }

  listHistory(
    productId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<ProductHistoryReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ProductHistory",
      request: { productId },
      context,
      requiredPermissions: ["products.view"],
      handler: async (req, ctx) => this.deps.ports.productRead.listHistory(ctx.tenantId, req.productId),
    });
  }

  listOpportunityLines(
    opportunityId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<OpportunityLineItemReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "OpportunityLineItems",
      request: { opportunityId },
      context,
      requiredPermissions: ["opportunities.view"],
      handler: async (req, ctx) =>
        this.deps.ports.productRead.listOpportunityLines(ctx.tenantId, req.opportunityId),
    });
  }

  createProduct(
    request: Omit<ProductCreateInput, "tenantId" | "actorUserId">,
    context: ApplicationContext,
  ): Promise<CommandResult<CatalogProductReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "CreateProduct",
      request,
      context,
      requiredPermissions: ["products.create"],
      handler: async (req, ctx) =>
        this.deps.ports.productWrite.create({
          ...req,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  updateProduct(
    request: { productId: string; patch: Omit<ProductUpdateInput, "actorUserId"> },
    context: ApplicationContext,
  ): Promise<CommandResult<CatalogProductReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "UpdateProduct",
      request,
      context,
      requiredPermissions: ["products.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.productWrite.update(ctx.tenantId, req.productId, {
          ...req.patch,
          actorUserId: ctx.actorId,
        }),
    });
  }

  archiveProduct(
    request: { productId: string },
    context: ApplicationContext,
  ): Promise<CommandResult<void>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "ArchiveProduct",
      request,
      context,
      requiredPermissions: ["products.delete"],
      handler: async (req, ctx) => {
        await this.deps.ports.productWrite.archive(ctx.tenantId, req.productId, ctx.actorId);
      },
    });
  }

  createCategory(
    request: Omit<ProductCategoryCreateInput, "tenantId" | "actorUserId">,
    context: ApplicationContext,
  ): Promise<CommandResult<ProductCategoryReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "CreateProductCategory",
      request,
      context,
      requiredPermissions: ["products.create"],
      handler: async (req, ctx) =>
        this.deps.ports.productWrite.createCategory({
          ...req,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  upsertRegionalPrice(
    request: Omit<ProductRegionalPriceInput, "tenantId" | "actorUserId">,
    context: ApplicationContext,
  ): Promise<CommandResult<ProductRegionalPriceReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "UpsertRegionalPrice",
      request,
      context,
      requiredPermissions: ["products.pricing"],
      handler: async (req, ctx) =>
        this.deps.ports.productWrite.upsertRegionalPrice({
          ...req,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  attachToOpportunity(
    request: Omit<AttachProductToOpportunityInput, "tenantId" | "actorUserId">,
    context: ApplicationContext,
  ): Promise<CommandResult<OpportunityLineItemReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "AttachOpportunityProduct",
      request,
      context,
      requiredPermissions: ["opportunities.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.productWrite.attachToOpportunity({
          ...req,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  updateOpportunityLine(
    request: Omit<UpdateOpportunityLineInput, "tenantId" | "actorUserId">,
    context: ApplicationContext,
  ): Promise<CommandResult<OpportunityLineItemReadModel>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "UpdateOpportunityLine",
      request,
      context,
      requiredPermissions: ["opportunities.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.productWrite.updateOpportunityLine({
          ...req,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  removeOpportunityLine(
    request: { lineId: string },
    context: ApplicationContext,
  ): Promise<CommandResult<void>> {
    const cmd = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmd.execute({
      commandType: "RemoveOpportunityLine",
      request,
      context,
      requiredPermissions: ["opportunities.edit"],
      handler: async (req, ctx) => {
        await this.deps.ports.productWrite.removeOpportunityLine(
          ctx.tenantId,
          req.lineId,
          ctx.actorId,
        );
      },
    });
  }
}
