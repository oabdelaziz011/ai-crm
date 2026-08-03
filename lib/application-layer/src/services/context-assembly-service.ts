import type { ApplicationContext, QueryResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { QueryPipeline } from "../pipeline/command-query-pipeline.js";
import { Customer360Aggregator } from "../aggregator/customer360-aggregator.js";
import { Lead360Aggregator } from "../aggregator/lead360-aggregator.js";

export type ContextAssemblyRequest = Readonly<{
  customerId?: string;
  leadId?: string;
  bookingId?: string;
  invoiceId?: string;
  taskEntityType?: string;
  taskEntityId?: string;
  conversationId?: string;
  knowledgeQuery?: string;
  includeWorkspace?: boolean;
  includeCompany?: boolean;
  includeFeatureFlags?: boolean;
  includeLicensing?: boolean;
  includeConfiguration?: boolean;
  employeeId?: string;
}>;

export type AssembledContext = Readonly<{
  customer?: Record<string, unknown>;
  customer360?: Record<string, unknown>;
  lead?: Record<string, unknown>;
  booking?: Record<string, unknown>;
  invoice?: Record<string, unknown>;
  task?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  knowledge?: Record<string, unknown>;
  conversation?: Record<string, unknown>;
  company?: Record<string, unknown>;
  employee?: Record<string, unknown>;
  featureFlags?: Record<string, unknown>;
  licensing?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  realtime?: Record<string, unknown>;
}>;

export class ContextAssemblyService {
  private readonly customer360: Customer360Aggregator;
  private readonly lead360: Lead360Aggregator;

  constructor(private readonly deps: ApplicationLayerDeps) {
    this.customer360 = new Customer360Aggregator({ ports: deps.ports });
    this.lead360 = new Lead360Aggregator({ ports: deps.ports });
  }

  assemble(
    request: ContextAssemblyRequest,
    context: ApplicationContext,
  ): Promise<QueryResult<AssembledContext>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "AssembleAIContext",
      request,
      context,
      requiredPermissions: ["ai.read"],
      handler: async (req, ctx) => this.buildContext(req, ctx),
    });
  }

  private async buildContext(
    request: ContextAssemblyRequest,
    context: ApplicationContext,
  ): Promise<AssembledContext> {
    const assembled: Record<string, unknown> = {};

    if (request.customerId) {
      const customer = await this.deps.ports.customerRead.getById(context.tenantId, request.customerId);
      if (customer) {
        assembled.customer = {
          id: customer.id,
          name: customer.displayName,
          email: customer.email ?? "",
          phone: customer.phone ?? "",
        };
        const c360 = await this.customer360.aggregate({ customerId: request.customerId }, context);
        if (c360) assembled.customer360 = c360;
      }
    }

    if (request.leadId) {
      const lead = await this.deps.ports.leadRead.getById(context.tenantId, request.leadId);
      if (lead) {
        assembled.lead = {
          id: lead.id,
          title: lead.title,
          contactName: lead.contactName,
          lifecycleStatus: lead.lifecycleStatus,
          score: lead.score,
        };
        const l360 = await this.lead360.aggregate({ leadId: request.leadId }, context);
        if (l360) assembled.lead = { ...assembled.lead as object, aggregate: l360 };
      }
    }

    if (request.bookingId) {
      const booking = await this.deps.ports.bookingRead.getById(context.tenantId, request.bookingId);
      if (booking) {
        assembled.booking = {
          id: booking.id,
          customerId: booking.customerId,
          scheduledAt: booking.scheduledAt,
          status: booking.status,
          service: booking.serviceName ?? "",
        };
      }
    }

    if (request.invoiceId) {
      const invoice = await this.deps.ports.invoiceRead.getById(context.tenantId, request.invoiceId);
      if (invoice) {
        assembled.invoice = {
          id: invoice.id,
          customerId: invoice.customerId,
          amountCents: invoice.amountCents,
          status: invoice.status,
        };
      }
    }

    if (request.taskEntityType && request.taskEntityId) {
      const tasks = await this.deps.ports.taskRead.listForEntity(
        context.tenantId,
        request.taskEntityType,
        request.taskEntityId,
        10,
      );
      assembled.task = { items: tasks };
    }

    if (request.includeWorkspace) {
      const workspace = await this.deps.ports.operationsWorkspaceRead.getConfig(context.tenantId, "operations");
      if (workspace) assembled.workspace = workspace.config;
    }

    if (request.knowledgeQuery) {
      const knowledge = await this.deps.ports.knowledgeRead.search(context.tenantId, request.knowledgeQuery, {
        limit: 8,
      });
      assembled.knowledge = {
        query: knowledge.query,
        contextText: knowledge.chunks.map((c) => c.content).join("\n\n"),
        chunkCount: knowledge.chunks.length,
        confidence: knowledge.confidence,
      };
    }

    if (request.conversationId) {
      assembled.conversation = { id: request.conversationId };
    }

    if (request.includeCompany) {
      assembled.company = { tenantId: context.tenantId };
    }

    if (request.employeeId) {
      const workload = await this.deps.ports.employeeRead.getWorkload(
        context.tenantId,
        request.employeeId,
        new Date().toISOString().slice(0, 10),
      );
      assembled.employee = {
        id: workload.employeeId,
        name: workload.employeeName,
        bookingsToday: workload.bookingsToday,
      };
    }

    if (request.includeFeatureFlags) {
      const flagContext = { companyId: context.tenantId, actorUserId: context.actorId };
      const flags = await this.deps.ports.featureFlagRead.resolveMany(
        context.tenantId,
        ["ai.chat", "ai.agents", "knowledge", "automation"],
        flagContext,
      );
      assembled.featureFlags = flags;
    }

    if (request.includeLicensing) {
      const license = await this.deps.ports.licenseRead.getCompanyLicense(context.tenantId);
      if (license) {
        assembled.licensing = {
          planCode: license.planCode,
          status: license.status,
        };
      }
    }

    if (request.includeConfiguration) {
      const config = await this.deps.ports.configurationRead.getPublished(
        context.tenantId,
        "operations",
        "default",
      );
      if (config) {
        assembled.configuration = {
          domain: config.domain,
          version: config.version,
          config: config.publishedConfig,
        };
      }
    }

    assembled.realtime = Object.freeze({
      assembledAt: new Date().toISOString(),
      tenantId: context.tenantId,
      actorId: context.actorId,
    });

    return Object.freeze(assembled);
  }
}
