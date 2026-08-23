import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { InfrastructurePorts } from "../ports/infrastructure-ports.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";
import { Customer360Aggregator } from "../aggregator/customer360-aggregator.js";
import type { Customer360AggregateDto } from "../dto/customer360-aggregate-dto.js";
import type {
  CreateCustomerRequestDto,
  CreateCustomerResponseDto,
  CreateBookingRequestDto,
  CreateBookingResponseDto,
  RescheduleBookingRequestDto,
  RescheduleBookingResponseDto,
  CancelBookingRequestDto,
  CancelBookingResponseDto,
  CheckOutCustomerRequestDto,
  CheckOutCustomerResponseDto,
  CheckInCustomerRequestDto,
  CheckInCustomerResponseDto,
  TransitionClinicStatusRequestDto,
  TransitionClinicStatusResponseDto,
  CompleteTriageRequestDto,
  CompleteTriageResponseDto,
  AssignEmployeeRequestDto,
  AssignEmployeeResponseDto,
  ExecuteWorkflowRequestDto,
  ExecuteWorkflowResponseDto,
  CollectPaymentRequestDto,
  CollectPaymentResponseDto,
  GenerateInvoiceRequestDto,
  GenerateInvoiceResponseDto,
  ConvertLeadRequestDto,
  ConvertLeadResponseDto,
  CompleteTaskRequestDto,
  CompleteTaskResponseDto,
  CreateTaskRequestDto,
  CreateTaskResponseDto,
  UploadFileRequestDto,
  UploadFileResponseDto,
  GenerateAISummaryRequestDto,
  GenerateAISummaryResponseDto,
  MarkNotificationReadRequestDto,
  MarkNotificationReadResponseDto,
  MarkAllNotificationsReadResponseDto,
  ArchiveNotificationRequestDto,
  ArchiveNotificationResponseDto,
  MarkNoShowBookingRequestDto,
  MarkNoShowBookingResponseDto,
} from "../dto/command-dtos.js";
import type {
  Customer360QueryRequestDto,
  Customer360ProjectionDto,
  OperationsQueueQueryRequestDto,
  OperationsQueueProjectionDto,
  TimelineQueryRequestDto,
  TimelineProjectionDto,
  DashboardQueryRequestDto,
  DashboardProjectionDto,
  AnalyticsQueryRequestDto,
  AnalyticsProjectionDto,
  NotificationCenterQueryRequestDto,
  NotificationCenterProjectionDto,
  WorkspaceQueryRequestDto,
  WorkspaceProjectionDto,
  CalendarQueryRequestDto,
  CalendarProjectionDto,
  RevenueQueryRequestDto,
  RevenueProjectionDto,
  EmployeeWorkloadQueryRequestDto,
  EmployeeWorkloadProjectionDto,
  ExecutiveInsightsQueryRequestDto,
  ExecutiveInsightsProjectionDto,
  OperationsAnalyticsQueryRequestDto,
  BookingsAnalyticsQueryRequestDto,
  PaymentsAnalyticsQueryRequestDto,
  InvoicesAnalyticsQueryRequestDto,
  ServicesAnalyticsQueryRequestDto,
  BranchAnalyticsQueryRequestDto,
  CustomerAnalyticsQueryRequestDto,
  UtilizationQueryRequestDto,
} from "../dto/query-dtos.js";
import * as CommandHandlers from "../handlers/commands/command-handlers.js";
import * as QueryHandlers from "../handlers/queries/query-handlers.js";
import { ResourceNotFoundError } from "../errors/application-errors.js";
import { EntityApplicationService } from "./entity-application-service.js";
import { LeadApplicationService } from "./lead-application-service.js";
import { OpportunityApplicationService } from "./opportunity-application-service.js";
import { ProductApplicationService } from "./product-application-service.js";
import { QuoteApplicationService } from "./quote-application-service.js";
import { TicketApplicationService } from "./ticket-application-service.js";
import { HandoffApplicationService } from "./handoff-application-service.js";
import { ContextAssemblyService } from "./context-assembly-service.js";
import { ConfigurationApplicationService } from "./configuration-application-service.js";
import {
  FeatureFlagApplicationService,
  LicensingApplicationService,
} from "./feature-flag-application-service.js";
import type { EnterpriseRuntimeCoordinatorPort, EnterpriseRuntimeInternalPort, UnifiedRuntimeExecuteRequest, UnifiedRuntimeExecuteResponse, UnifiedRuntimeServiceContext } from "../ports/ai-runtime-port.js";
import { UnifiedEnterpriseAIRuntime } from "./unified-enterprise-ai-runtime.js";

export type ApplicationLayerDeps = Readonly<{
  ports: ApplicationPorts;
  infra: InfrastructurePorts;
  commandPipeline?: CommandPipeline;
  queryPipeline?: QueryPipeline;
  runtimeCoordinator?: EnterpriseRuntimeCoordinatorPort;
  internalEnterpriseRuntime?: EnterpriseRuntimeInternalPort;
}>;

/** Customer360 — orchestrates customer read + timeline query ports. */
export class Customer360ApplicationService {
  private readonly deps: ApplicationLayerDeps;
  private readonly pipeline: QueryPipeline;
  private readonly aggregator: Customer360Aggregator;

  constructor(deps: ApplicationLayerDeps) {
    this.deps = deps;
    this.pipeline = deps.queryPipeline ?? new QueryPipeline();
    this.aggregator = new Customer360Aggregator({ ports: deps.ports });
  }

  getCustomer360(request: Customer360QueryRequestDto, context: ApplicationContext): Promise<QueryResult<Customer360ProjectionDto>> {
    return this.pipeline.execute({
      queryType: "Customer360",
      request,
      context,
      requiredPermissions: ["customer.read"],
      handler: (req, ctx) => QueryHandlers.handleCustomer360Query({ ports: this.deps.ports }, req, ctx),
    });
  }

  getCustomer360Aggregate(
    request: Customer360QueryRequestDto & { leadId?: string | null; visibleSections?: readonly string[] },
    context: ApplicationContext,
  ): Promise<QueryResult<Customer360AggregateDto>> {
    return this.pipeline.execute({
      queryType: "Customer360Aggregate",
      request,
      context,
      requiredPermissions: ["customer.read"],
      handler: async (req, ctx) => {
        const aggregate = await this.aggregator.aggregate(
          {
            customerId: req.customerId,
            leadId: req.leadId,
            templateKey: req.templateKey,
            role: req.role,
            visibleSections: req.visibleSections,
          },
          ctx,
        );
        if (!aggregate) throw new ResourceNotFoundError("Customer", req.customerId);
        return aggregate;
      },
    });
  }
}

export class OperationsApplicationService {
  private readonly deps: ApplicationLayerDeps;
  private readonly commandPipeline: CommandPipeline;
  private readonly queryPipeline: QueryPipeline;

  constructor(deps: ApplicationLayerDeps) {
    this.deps = deps;
    this.commandPipeline = deps.commandPipeline ?? new CommandPipeline({ audit: deps.infra.audit, idempotency: deps.infra.idempotency });
    this.queryPipeline = deps.queryPipeline ?? new QueryPipeline();
  }

  getQueue(request: OperationsQueueQueryRequestDto, context: ApplicationContext): Promise<QueryResult<OperationsQueueProjectionDto>> {
    return this.queryPipeline.execute({
      queryType: "OperationsQueue",
      request,
      context,
      requiredPermissions: ["operations.read"],
      handler: (req, ctx) => QueryHandlers.handleOperationsQueueQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  checkOutCustomer(request: CheckOutCustomerRequestDto, context: ApplicationContext): Promise<CommandResult<CheckOutCustomerResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "CheckOutCustomer",
      request,
      context,
      requiredPermissions: ["operations.write"],
      handler: async (req, ctx) => {
        const { response, eventIds } = await CommandHandlers.handleCheckOutCustomer(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
      eventIds: [],
    });
  }

  checkInCustomer(request: CheckInCustomerRequestDto, context: ApplicationContext): Promise<CommandResult<CheckInCustomerResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "CheckInCustomer",
      request,
      context,
      requiredPermissions: ["operations.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCheckInCustomer(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  transitionClinicStatus(
    request: TransitionClinicStatusRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<TransitionClinicStatusResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "TransitionClinicStatus",
      request,
      context,
      requiredPermissions: ["operations.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleTransitionClinicStatus(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  completeTriage(
    request: CompleteTriageRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<CompleteTriageResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "CompleteTriage",
      request,
      context,
      requiredPermissions: ["operations.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCompleteTriage(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  assignEmployee(request: AssignEmployeeRequestDto, context: ApplicationContext): Promise<CommandResult<AssignEmployeeResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "AssignEmployee",
      request,
      context,
      requiredPermissions: ["operations.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleAssignEmployee(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  markNoShowBooking(
    request: MarkNoShowBookingRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<MarkNoShowBookingResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "MarkNoShowBooking",
      request,
      context,
      requiredPermissions: ["operations.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleMarkNoShowBooking(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  executeWorkflow(request: ExecuteWorkflowRequestDto, context: ApplicationContext): Promise<CommandResult<ExecuteWorkflowResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "ExecuteWorkflow",
      request,
      context,
      requiredPermissions: ["operations.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleExecuteWorkflow(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }
}

export class BookingApplicationService {
  private readonly deps: ApplicationLayerDeps;
  private readonly commandPipeline: CommandPipeline;
  private readonly queryPipeline: QueryPipeline;

  constructor(deps: ApplicationLayerDeps) {
    this.deps = deps;
    this.commandPipeline = deps.commandPipeline ?? new CommandPipeline({ audit: deps.infra.audit, idempotency: deps.infra.idempotency });
    this.queryPipeline = deps.queryPipeline ?? new QueryPipeline();
  }

  createBooking(request: CreateBookingRequestDto, context: ApplicationContext): Promise<CommandResult<CreateBookingResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "CreateBooking",
      request,
      context,
      requiredPermissions: ["booking.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCreateBooking({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }

  cancelBooking(request: CancelBookingRequestDto, context: ApplicationContext): Promise<CommandResult<CancelBookingResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "CancelBooking",
      request,
      context,
      requiredPermissions: ["bookings.delete", "bookings.edit", "booking.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCancelBooking({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }

  rescheduleBooking(
    request: RescheduleBookingRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<RescheduleBookingResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "RescheduleBooking",
      request,
      context,
      requiredPermissions: ["booking.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleRescheduleBooking(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  getCalendar(request: CalendarQueryRequestDto, context: ApplicationContext): Promise<QueryResult<CalendarProjectionDto>> {
    return this.queryPipeline.execute({
      queryType: "Calendar",
      request,
      context,
      requiredPermissions: ["booking.read"],
      handler: (req, ctx) => QueryHandlers.handleCalendarQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  searchAvailability(
    request: import("../ports/scheduling-query-port.js").SearchAvailabilityQuery,
    context: ApplicationContext,
  ) {
    return this.queryPipeline.execute({
      queryType: "SearchAvailability",
      request,
      context,
      requiredPermissions: ["availability.search"],
      handler: async (req) => this.deps.ports.schedulingQuery.searchAvailability(req),
    });
  }

  findNextAvailable(
    request: import("../ports/scheduling-query-port.js").FindNextAvailableQuery,
    context: ApplicationContext,
  ) {
    return this.queryPipeline.execute({
      queryType: "FindNextAvailable",
      request,
      context,
      requiredPermissions: ["availability.search"],
      handler: async (req) => this.deps.ports.schedulingQuery.findNextAvailable(req),
    });
  }

  recommendAppointment(
    request: import("../ports/scheduling-query-port.js").RecommendAppointmentQuery,
    context: ApplicationContext,
  ) {
    return this.queryPipeline.execute({
      queryType: "RecommendAppointment",
      request,
      context,
      requiredPermissions: ["availability.search"],
      handler: async (req) => this.deps.ports.schedulingQuery.recommendAppointment(req),
    });
  }

  searchBookings(
    request: { customerId?: string; daysBack?: number },
    context: ApplicationContext,
  ) {
    return this.queryPipeline.execute({
      queryType: "SearchBookings",
      request,
      context,
      requiredPermissions: ["bookings.view"],
      handler: async (req, ctx) => {
        const daysBack = req.daysBack ?? 30;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysBack);
        const bookings = req.customerId
          ? await this.deps.ports.bookingRead.listForCustomer(ctx.tenantId, req.customerId)
          : await this.deps.ports.bookingRead.listQueue(ctx.tenantId, { pageSize: 200 });
        const filtered = bookings.filter((b) => new Date(b.scheduledAt) >= cutoff);
        return Object.freeze({ bookings: Object.freeze(filtered), total: filtered.length });
      },
    });
  }

  checkInBooking(
    request: CheckInCustomerRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<CheckInCustomerResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "CheckInCustomer",
      request,
      context,
      requiredPermissions: ["booking.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCheckInCustomer(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  checkOutBooking(
    request: CheckOutCustomerRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<CheckOutCustomerResponseDto>> {
    return this.commandPipeline.execute({
      commandType: "CheckOutCustomer",
      request,
      context,
      requiredPermissions: ["booking.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCheckOutCustomer(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }
}

export class PaymentApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  collectPayment(request: CollectPaymentRequestDto, context: ApplicationContext): Promise<CommandResult<CollectPaymentResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "CollectPayment",
      request,
      context,
      requiredPermissions: ["invoices.create", "operations.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCollectPayment({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }
}

export class InvoiceApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  generateInvoice(request: GenerateInvoiceRequestDto, context: ApplicationContext): Promise<CommandResult<GenerateInvoiceResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "GenerateInvoice",
      request,
      context,
      requiredPermissions: ["invoices.create", "operations.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleGenerateInvoice({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }
}

export class TimelineApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getTimeline(request: TimelineQueryRequestDto, context: ApplicationContext): Promise<QueryResult<TimelineProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "Timeline",
      request,
      context,
      requiredPermissions: ["timeline.read"],
      handler: (req, ctx) => QueryHandlers.handleTimelineQuery({ ports: this.deps.ports }, req, ctx),
    });
  }
}

export class DashboardApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getDashboard(request: DashboardQueryRequestDto, context: ApplicationContext): Promise<QueryResult<DashboardProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "Dashboard",
      request,
      context,
      requiredPermissions: ["dashboard.read"],
      handler: (req, ctx) => QueryHandlers.handleDashboardQuery({ ports: this.deps.ports }, req, ctx),
    });
  }
}

export class AnalyticsApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getAnalytics(request: AnalyticsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "Analytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getRevenue(request: RevenueQueryRequestDto, context: ApplicationContext): Promise<QueryResult<RevenueProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "Revenue",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleRevenueQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getEmployeeWorkload(request: EmployeeWorkloadQueryRequestDto, context: ApplicationContext): Promise<QueryResult<EmployeeWorkloadProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "EmployeeWorkload",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleEmployeeWorkloadQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getOperationsAnalytics(request: OperationsAnalyticsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "OperationsAnalytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleOperationsAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getBookingsAnalytics(request: BookingsAnalyticsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "BookingsAnalytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleBookingsAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getPaymentsAnalytics(request: PaymentsAnalyticsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "PaymentsAnalytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handlePaymentsAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getInvoicesAnalytics(request: InvoicesAnalyticsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "InvoicesAnalytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleInvoicesAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getServicesAnalytics(request: ServicesAnalyticsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ServicesAnalytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleServicesAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getBranchAnalytics(request: BranchAnalyticsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "BranchAnalytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleBranchAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getCustomerAnalytics(request: CustomerAnalyticsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "CustomerAnalytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleCustomerAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  getUtilization(request: UtilizationQueryRequestDto, context: ApplicationContext): Promise<QueryResult<AnalyticsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "UtilizationAnalytics",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleUtilizationAnalyticsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }
}

export class ExecutiveInsightsApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getInsights(request: ExecutiveInsightsQueryRequestDto, context: ApplicationContext): Promise<QueryResult<ExecutiveInsightsProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ExecutiveInsights",
      request,
      context,
      requiredPermissions: ["analytics.read"],
      handler: (req, ctx) => QueryHandlers.handleExecutiveInsightsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }
}

export class NotificationApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getNotifications(request: NotificationCenterQueryRequestDto, context: ApplicationContext): Promise<QueryResult<NotificationCenterProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "NotificationCenter",
      request,
      context,
      requiredPermissions: ["notification.read"],
      handler: (req, ctx) => QueryHandlers.handleNotificationCenterQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  markRead(request: MarkNotificationReadRequestDto, context: ApplicationContext): Promise<CommandResult<MarkNotificationReadResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "MarkNotificationRead",
      request,
      context,
      requiredPermissions: ["notification.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleMarkNotificationRead({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }

  markAllRead(context: ApplicationContext): Promise<CommandResult<MarkAllNotificationsReadResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "MarkAllNotificationsRead",
      request: {},
      context,
      requiredPermissions: ["notification.write"],
      handler: async (_req, ctx) => {
        const { response } = await CommandHandlers.handleMarkAllNotificationsRead({ ports: this.deps.ports, infra: this.deps.infra }, {}, ctx);
        return response;
      },
    });
  }

  archive(request: ArchiveNotificationRequestDto, context: ApplicationContext): Promise<CommandResult<ArchiveNotificationResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "ArchiveNotification",
      request,
      context,
      requiredPermissions: ["notification.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleArchiveNotification({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }
}

export class WorkspaceApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getWorkspace(request: WorkspaceQueryRequestDto, context: ApplicationContext): Promise<QueryResult<WorkspaceProjectionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "Workspace",
      request,
      context,
      requiredPermissions: ["workspace.read"],
      handler: (req, ctx) => QueryHandlers.handleWorkspaceQuery({ ports: this.deps.ports }, req, ctx),
    });
  }
}

export class CustomerApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  createCustomer(request: CreateCustomerRequestDto, context: ApplicationContext): Promise<CommandResult<CreateCustomerResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit, idempotency: this.deps.infra.idempotency });
    return pipeline.execute({
      commandType: "CreateCustomer",
      request,
      context,
      requiredPermissions: ["customer.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCreateCustomer({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }

  updateCustomer(
    request: import("../dto/command-dtos.js").UpdateCustomerRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<import("../dto/command-dtos.js").UpdateCustomerResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit, idempotency: this.deps.infra.idempotency });
    return pipeline.execute({
      commandType: "UpdateCustomer",
      request,
      context,
      requiredPermissions: ["customer.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleUpdateCustomer({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }

  convertLead(request: ConvertLeadRequestDto, context: ApplicationContext): Promise<CommandResult<ConvertLeadResponseDto>> {
    return new LeadApplicationService(this.deps).convertLead(request, context);
  }
}

export class TaskApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  createTask(request: CreateTaskRequestDto, context: ApplicationContext): Promise<CommandResult<CreateTaskResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "CreateTask",
      request,
      context,
      requiredPermissions: ["task.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCreateTask({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }

  completeTask(request: CompleteTaskRequestDto, context: ApplicationContext): Promise<CommandResult<CompleteTaskResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "CompleteTask",
      request,
      context,
      requiredPermissions: ["task.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleCompleteTask({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }
}

export class FileApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  uploadFile(request: UploadFileRequestDto, context: ApplicationContext): Promise<CommandResult<UploadFileResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "UploadFile",
      request,
      context,
      requiredPermissions: ["entity.files.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleUploadFile({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }
}

export class AIApplicationService {
  private unifiedRuntime: UnifiedEnterpriseAIRuntime | null = null;

  constructor(private readonly deps: ApplicationLayerDeps) {
    if (deps.runtimeCoordinator) {
      this.unifiedRuntime = UnifiedEnterpriseAIRuntime.fromApplicationDeps(deps, deps.runtimeCoordinator);
    }
  }

  /** Domain service facade for tool routing — not the runtime pipeline coordinator. */
  get coordinator() {
    return Object.freeze({
      booking: new BookingApplicationService(this.deps),
      lead: new LeadApplicationService(this.deps),
      ticket: new TicketApplicationService(this.deps),
      handoff: new HandoffApplicationService(this.deps),
      knowledge: new KnowledgeApplicationService(this.deps),
      customer: new CustomerApplicationService(this.deps),
      context: new ContextAssemblyService(this.deps),
    });
  }

  /** Single public AI runtime entry — all chat/workflow AI must route through this. */
  execute(
    runtimeCtx: UnifiedRuntimeServiceContext,
    appCtx: ApplicationContext,
    request: UnifiedRuntimeExecuteRequest,
  ): Promise<UnifiedRuntimeExecuteResponse> {
    if (!this.unifiedRuntime) {
      throw new Error("Unified AI runtime is not configured. Wire runtimeCoordinator in ApplicationLayerDeps.");
    }
    return this.unifiedRuntime.execute(runtimeCtx, appCtx, request);
  }

  /** Internal enterprise runtime for workflow nodes — accessed only through unified entry. */
  getInternalRuntime(): EnterpriseRuntimeInternalPort {
    if (!this.deps.internalEnterpriseRuntime) {
      throw new Error("Internal enterprise runtime is not configured.");
    }
    return this.deps.internalEnterpriseRuntime;
  }

  invalidateRuntimeContext(tenantId: string, conversationId?: string): Promise<void> {
    if (!this.unifiedRuntime) return Promise.resolve();
    return this.unifiedRuntime.invalidateContext(tenantId, conversationId);
  }

  generateSummary(request: GenerateAISummaryRequestDto, context: ApplicationContext): Promise<CommandResult<GenerateAISummaryResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "GenerateAISummary",
      request,
      context,
      requiredPermissions: ["ai.write"],
      handler: async (req, ctx) => {
        const { response } = await CommandHandlers.handleGenerateAISummary({ ports: this.deps.ports, infra: this.deps.infra }, req, ctx);
        return response;
      },
    });
  }
}

export class KnowledgeApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getDocument(documentId: string, context: ApplicationContext) {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "KnowledgeDocument",
      request: { documentId },
      context,
      requiredPermissions: ["knowledge.view"],
      handler: async (req, ctx) => {
        const doc = await this.deps.ports.knowledgeRead.getDocument(ctx.tenantId, req.documentId);
        if (!doc) throw new ResourceNotFoundError("KnowledgeDocument", req.documentId);
        return doc;
      },
    });
  }

  searchKnowledge(query: string, context: ApplicationContext, options?: { limit?: number }) {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "KnowledgeSearch",
      request: { query, options },
      context,
      requiredPermissions: ["knowledge.view"],
      handler: async (req, ctx) =>
        this.deps.ports.knowledgeRead.search(ctx.tenantId, req.query, req.options),
    });
  }

  publishDocument(documentId: string, context: ApplicationContext) {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "PublishKnowledgeDocument",
      request: { documentId },
      context,
      requiredPermissions: ["knowledge.write"],
      handler: async (req, ctx) => {
        const existing = await this.deps.ports.knowledgeRead.getDocument(ctx.tenantId, req.documentId);
        if (!existing) throw new ResourceNotFoundError("KnowledgeDocument", req.documentId);
        const doc = await this.deps.ports.knowledgeWrite.publishDocument({
          tenantId: ctx.tenantId,
          documentId: req.documentId,
          title: existing.title,
          actorUserId: ctx.actorId,
        });
        const eventId = await this.deps.infra.events.publishKnowledgeUpdated({
          documentId: doc.id,
          title: doc.title,
          action: "published",
          context: {
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            actorId: ctx.actorId,
            actorType: ctx.actorType,
            correlationId: ctx.correlationId,
          },
        });
        return Object.freeze({ ...doc, eventIds: [eventId] });
      },
    });
  }
}

export type ApplicationServices = Readonly<{
  customer360: Customer360ApplicationService;
  operations: OperationsApplicationService;
  booking: BookingApplicationService;
  payment: PaymentApplicationService;
  invoice: InvoiceApplicationService;
  timeline: TimelineApplicationService;
  dashboard: DashboardApplicationService;
  analytics: AnalyticsApplicationService;
  executiveInsights: ExecutiveInsightsApplicationService;
  notification: NotificationApplicationService;
  workspace: WorkspaceApplicationService;
  customer: CustomerApplicationService;
  task: TaskApplicationService;
  file: FileApplicationService;
  ai: AIApplicationService;
  knowledge: KnowledgeApplicationService;
  entity: EntityApplicationService;
  lead: LeadApplicationService;
  opportunity: OpportunityApplicationService;
  product: ProductApplicationService;
  quote: QuoteApplicationService;
  ticket: TicketApplicationService;
  handoff: HandoffApplicationService;
  context: ContextAssemblyService;
  configuration: ConfigurationApplicationService;
  featureFlags: FeatureFlagApplicationService;
  licensing: LicensingApplicationService;
}>;

export function createApplicationServices(deps: ApplicationLayerDeps): ApplicationServices {
  return Object.freeze({
    customer360: new Customer360ApplicationService(deps),
    operations: new OperationsApplicationService(deps),
    booking: new BookingApplicationService(deps),
    payment: new PaymentApplicationService(deps),
    invoice: new InvoiceApplicationService(deps),
    timeline: new TimelineApplicationService(deps),
    dashboard: new DashboardApplicationService(deps),
    analytics: new AnalyticsApplicationService(deps),
    executiveInsights: new ExecutiveInsightsApplicationService(deps),
    notification: new NotificationApplicationService(deps),
    workspace: new WorkspaceApplicationService(deps),
    customer: new CustomerApplicationService(deps),
    task: new TaskApplicationService(deps),
    file: new FileApplicationService(deps),
    ai: new AIApplicationService(deps),
    knowledge: new KnowledgeApplicationService(deps),
    entity: new EntityApplicationService(deps),
    lead: new LeadApplicationService(deps),
    opportunity: new OpportunityApplicationService(deps),
    product: new ProductApplicationService(deps),
    quote: new QuoteApplicationService(deps),
    ticket: new TicketApplicationService(deps),
    handoff: new HandoffApplicationService(deps),
    context: new ContextAssemblyService(deps),
    configuration: new ConfigurationApplicationService(deps),
    featureFlags: new FeatureFlagApplicationService(deps),
    licensing: new LicensingApplicationService(deps),
  });
}
