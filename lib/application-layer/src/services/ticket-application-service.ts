import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";
import type { TicketPriority, TicketReadModel, TicketSearchFilter, TicketStatus } from "../ports/ticket-ports.js";
import * as TicketCommandHandlers from "../handlers/commands/ticket-command-handlers.js";

export type CreateTicketRequestDto = Readonly<{
  subject: string;
  description?: string;
  priority?: TicketPriority;
  customerId?: string;
  conversationId?: string;
}>;

export type UpdateTicketRequestDto = Readonly<{
  ticketId: string;
  subject?: string;
  description?: string;
}>;

export class TicketApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  searchTickets(
    request: TicketSearchFilter,
    context: ApplicationContext,
  ): Promise<QueryResult<{ tickets: TicketReadModel[]; total: number }>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "TicketSearch",
      request,
      context,
      requiredPermissions: ["tickets.view"],
      handler: async (req, ctx) => this.deps.ports.ticketRead.search(ctx.tenantId, req),
    });
  }

  createTicket(
    request: CreateTicketRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<TicketReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "CreateTicket",
      request,
      context,
      requiredPermissions: ["tickets.create"],
      handler: async (req, ctx) => {
        const { response } = await TicketCommandHandlers.handleCreateTicket(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  updateTicket(
    request: UpdateTicketRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<TicketReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "UpdateTicket",
      request,
      context,
      requiredPermissions: ["tickets.edit"],
      handler: async (req, ctx) => {
        const { response } = await TicketCommandHandlers.handleUpdateTicket(
          { ports: this.deps.ports, infra: this.deps.infra },
          { ticketId: req.ticketId, patch: { subject: req.subject, description: req.description } },
          ctx,
        );
        return response;
      },
    });
  }

  closeTicket(
    request: { ticketId: string; resolutionNote?: string; status?: "resolved" | "closed" },
    context: ApplicationContext,
  ): Promise<CommandResult<TicketReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "CloseTicket",
      request,
      context,
      requiredPermissions: ["tickets.close"],
      handler: async (req, ctx) => {
        const { response } = await TicketCommandHandlers.handleCloseTicket(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  assignTicket(
    request: { ticketId: string; assigneeUserId?: string; assigneeName?: string },
    context: ApplicationContext,
  ): Promise<CommandResult<TicketReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "AssignTicket",
      request,
      context,
      requiredPermissions: ["tickets.assign"],
      handler: async (req, ctx) => {
        const { response } = await TicketCommandHandlers.handleAssignTicket(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  addTicketComment(
    request: { ticketId: string; body: string; isInternal?: boolean },
    context: ApplicationContext,
  ): Promise<CommandResult<{ commentId: string; ticketId: string }>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "AddTicketComment",
      request,
      context,
      requiredPermissions: ["tickets.comment"],
      handler: async (req, ctx) => {
        const { response } = await TicketCommandHandlers.handleAddTicketComment(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  changeTicketPriority(
    request: { ticketId: string; priority: TicketPriority },
    context: ApplicationContext,
  ): Promise<CommandResult<TicketReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "ChangeTicketPriority",
      request,
      context,
      requiredPermissions: ["tickets.edit"],
      handler: async (req, ctx) => {
        const { response } = await TicketCommandHandlers.handleChangeTicketPriority(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  changeTicketStatus(
    request: { ticketId: string; status: TicketStatus },
    context: ApplicationContext,
  ): Promise<CommandResult<TicketReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "ChangeTicketStatus",
      request,
      context,
      requiredPermissions: ["tickets.edit"],
      handler: async (req, ctx) => {
        const { response } = await TicketCommandHandlers.handleChangeTicketStatus(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }
}
