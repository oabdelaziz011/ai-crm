import type { EntityRelationshipReadPort } from "../entity/entity-relationship-port.js";
import type {
  ConfigurationReadPort,
  ConfigurationWritePort,
  ConfigurationCachePort,
} from "./configuration-ports.js";
import type { FeatureFlagReadPort, FeatureFlagWritePort } from "./feature-flag-ports.js";
import type { LicenseReadPort, LicenseWritePort } from "./license-ports.js";
import type {
  EntityContactReadPort,
  EntityContactWritePort,
  EntityFileReadPort,
  EntityFileWritePort,
  EntityTagReadPort,
  EntityTagWritePort,
  EntityCustomFieldReadPort,
  EntityCustomFieldWritePort,
  EntityActivityReadPort,
  EntityActivityWritePort,
} from "../entity/entity-models.js";

/** Read-only customer projection port — no implementation in this phase. */
export type CustomerReadPort = {
  getById(tenantId: string, customerId: string): Promise<CustomerReadModel | null>;
  search(tenantId: string, query: string, limit?: number): Promise<CustomerReadModel[]>;
};

export type CustomerReadModel = Readonly<{
  id: string;
  tenantId: string;
  displayName: string;
  email?: string;
  phone?: string;
  isVip: boolean;
  outstandingBalanceCents: number;
  currentStatus: string;
  createdAt: string;
  notes?: string;
}>;

/** Write-only customer port — no implementation in this phase. */
export type CustomerWritePort = {
  create(input: CustomerCreateInput): Promise<CustomerReadModel>;
  update(tenantId: string, customerId: string, patch: Record<string, unknown>): Promise<CustomerReadModel>;
};

export type CustomerCreateInput = Readonly<{
  tenantId: string;
  displayName: string;
  email?: string;
  phone?: string;
  leadSource?: string;
}>;

export type LeadQueueFilter = Readonly<{
  search?: string;
  stageId?: string;
  pipelineId?: string;
  assignedUserId?: string;
  lifecycleStatus?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}>;

export type LeadReadPort = {
  getById(tenantId: string, leadId: string): Promise<LeadReadModel | null>;
  findByCustomer(tenantId: string, customerId: string): Promise<LeadReadModel | null>;
  search(tenantId: string, query: string, limit?: number): Promise<LeadReadModel[]>;
  list(tenantId: string, filter?: LeadQueueFilter): Promise<LeadListResult>;
  listPipelines(tenantId: string): Promise<LeadPipelineReadModel[]>;
  listStages(tenantId: string, pipelineId: string): Promise<LeadStageReadModel[]>;
  getPipelineBoard(tenantId: string, pipelineId: string): Promise<LeadPipelineBoardModel>;
  getDashboardMetrics(tenantId: string, periodStartIso?: string): Promise<LeadDashboardMetricsModel>;
};

export type LeadListResult = Readonly<{
  items: readonly LeadReadModel[];
  total: number;
}>;

export type LeadWritePort = {
  create(input: LeadCreateInput): Promise<LeadReadModel>;
  update(tenantId: string, leadId: string, patch: LeadUpdateInput): Promise<LeadReadModel>;
  assign(tenantId: string, leadId: string, assigneeUserId: string, actorUserId: string): Promise<LeadReadModel>;
  changeStage(tenantId: string, leadId: string, stageId: string, actorUserId: string): Promise<LeadReadModel>;
  bulkChangeStage(tenantId: string, leadIds: readonly string[], stageId: string, actorUserId: string): Promise<void>;
  convert(tenantId: string, leadId: string, actorUserId: string): Promise<LeadConvertResult>;
  archive(tenantId: string, leadId: string, actorUserId: string): Promise<void>;
};

export type LeadCreateInput = Readonly<{
  tenantId: string;
  title: string;
  contactName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  sourceId?: string;
  priority?: string;
  estimatedValue?: number;
  pipelineId?: string;
  actorUserId: string;
}>;

export type LeadUpdateInput = Readonly<{
  title?: string;
  contactName?: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  priority?: string;
  estimatedValue?: number | null;
  score?: number;
  actorUserId: string;
}>;

export type LeadConvertResult = Readonly<{
  lead: LeadReadModel;
  customerId: string;
}>;

export type LeadReadModel = Readonly<{
  id: string;
  tenantId: string;
  title: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  lifecycleStatus: string;
  priority: string;
  score: number;
  estimatedValue: number | null;
  currency: string;
  pipelineId: string;
  stageId: string;
  assignedUserId: string | null;
  customerId: string | null;
  conversationId: string | null;
  isQualified: boolean;
  source?: string;
  campaign?: string;
  owner?: string;
  customFields?: Readonly<Record<string, string>>;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type LeadPipelineReadModel = Readonly<{
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  isActive: boolean;
}>;

export type LeadStageReadModel = Readonly<{
  id: string;
  tenantId: string;
  pipelineId: string;
  name: string;
  slug: string;
  lifecycleStatus: string;
  sortOrder: number;
  probabilityPercent: number;
  isTerminal: boolean;
  leadCount?: number;
  totalValue?: number;
}>;

export type LeadPipelineBoardModel = Readonly<{
  pipeline: LeadPipelineReadModel;
  stages: readonly LeadStageReadModel[];
  leadsByStage: Readonly<Record<string, readonly LeadReadModel[]>>;
}>;

export type LeadDashboardMetricsModel = Readonly<{
  totalLeads: number;
  leadsByStatus: Readonly<Record<string, number>>;
  conversionsInPeriod: number;
  createdInPeriod: number;
  forecastValue: number;
  conversionRate: number;
  pipelineMetrics: readonly Readonly<{
    pipelineId: string;
    pipelineName: string;
    leadCount: number;
    pipelineValue: number;
  }>[];
}>;

export type BookingReadPort = {
  getById(tenantId: string, bookingId: string): Promise<BookingReadModel | null>;
  listQueue(tenantId: string, filter: BookingQueueFilter): Promise<BookingReadModel[]>;
  listCalendar(tenantId: string, from: string, to: string, employeeId?: string): Promise<BookingReadModel[]>;
  listForCustomer(tenantId: string, customerId: string): Promise<BookingReadModel[]>;
};

export type BookingWritePort = {
  create(input: BookingCreateInput): Promise<BookingReadModel>;
  reschedule(tenantId: string, bookingId: string, scheduledAt: string): Promise<BookingReadModel>;
  cancel(tenantId: string, bookingId: string, reason?: string): Promise<BookingReadModel>;
  markNoShow(tenantId: string, bookingId: string, gracePeriodMinutes?: number): Promise<BookingReadModel>;
  checkIn(tenantId: string, bookingId: string, roomId?: string): Promise<BookingReadModel>;
  checkOut(tenantId: string, bookingId: string): Promise<BookingReadModel>;
  assignEmployee(tenantId: string, bookingId: string, employeeId: string): Promise<BookingReadModel>;
};

export type BookingCreateInput = Readonly<{
  tenantId: string;
  customerId: string;
  scheduledAt: string;
  serviceId?: string;
  employeeId?: string;
}>;

export type BookingQueueFilter = Readonly<{
  search?: string;
  page?: number;
  pageSize?: number;
  statusFilter?: string;
}>;

export type BookingReadModel = Readonly<{
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string;
  reference: string;
  scheduledAt: string;
  status: string;
  paymentStatus: string;
  employeeId?: string;
  employeeName?: string;
  roomId?: string;
  serviceName?: string;
}>;

export type PaymentReadPort = {
  getById(tenantId: string, paymentId: string): Promise<PaymentReadModel | null>;
  listForCustomer(tenantId: string, customerId: string): Promise<PaymentReadModel[]>;
};

export type PaymentWritePort = {
  collect(input: PaymentCollectInput): Promise<PaymentReadModel>;
  refund(tenantId: string, paymentId: string, amountCents: number, reason?: string): Promise<PaymentReadModel>;
};

export type PaymentCollectInput = Readonly<{
  tenantId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  method: string;
  invoiceId?: string;
}>;

export type PaymentReadModel = Readonly<{
  id: string;
  tenantId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  method: string;
  collectedAt: string;
}>;

export type InvoiceReadPort = {
  getById(tenantId: string, invoiceId: string): Promise<InvoiceReadModel | null>;
  listForCustomer(tenantId: string, customerId: string): Promise<InvoiceReadModel[]>;
};

export type InvoiceWritePort = {
  generate(input: InvoiceGenerateInput): Promise<InvoiceReadModel>;
};

export type InvoiceGenerateInput = Readonly<{
  tenantId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  dueAt?: string;
}>;

export type InvoiceReadModel = Readonly<{
  id: string;
  tenantId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  generatedAt: string;
  status: string;
  number?: string;
}>;

export type TimelineQueryOptions = Readonly<{
  limit?: number;
  offset?: number;
  search?: string;
  eventTypes?: readonly string[];
  from?: string;
  to?: string;
}>;

export type TimelineReadPort = {
  listForEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    options?: TimelineQueryOptions | number,
  ): Promise<TimelineReadModel[]>;
};

export type CustomerTagReadPort = {
  listForCustomer(tenantId: string, customerId: string): Promise<CustomerTagReadModel[]>;
};

export type CustomerTagReadModel = Readonly<{
  id: string;
  label: string;
}>;

export type CustomerAddressReadPort = {
  listForCustomer(tenantId: string, customerId: string): Promise<CustomerAddressReadModel[]>;
};

export type CustomerAddressReadModel = Readonly<{
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  isPrimary: boolean;
}>;

export type CustomerContactReadPort = {
  listForCustomer(tenantId: string, customerId: string): Promise<CustomerContactReadModel[]>;
};

export type CustomerContactReadModel = Readonly<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
}>;

export type CustomerCustomFieldReadPort = {
  listForCustomer(tenantId: string, customerId: string): Promise<CustomerCustomFieldReadModel[]>;
};

export type CustomerCustomFieldReadModel = Readonly<{
  key: string;
  label: string;
  value: string;
}>;

export type ActivityReadPort = {
  listForCustomer(tenantId: string, customerId: string, limit?: number): Promise<ActivityReadModel[]>;
};

export type ActivityReadModel = Readonly<{
  id: string;
  channel: string;
  subject: string;
  occurredAt: string;
  direction?: string;
  preview?: string;
  actor?: string;
}>;

export type TimelineReadModel = Readonly<{
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  actor: string;
  eventType: string;
}>;

export type NotificationListFilter = Readonly<{
  unreadOnly?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  eventType?: string;
  priority?: string;
  includeArchived?: boolean;
}>;

export type NotificationReadModel = Readonly<{
  id: string;
  tenantId: string;
  recipientUserId?: string | null;
  title: string;
  message: string;
  category: string;
  priority: string;
  severity: string;
  read: boolean;
  createdAt: string;
  readAt?: string;
  correlationId?: string;
  entityType?: string;
  entityId?: string;
  navigationTarget?: string;
  metadata?: Readonly<Record<string, string>>;
}>;

export type NotificationListResult = Readonly<{
  items: readonly NotificationReadModel[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}>;

export type NotificationCreateInput = Readonly<{
  tenantId: string;
  recipientUserId?: string | null;
  recipientRole?: string;
  eventType: string;
  title: string;
  body: string;
  category: string;
  priority: string;
  severity: string;
  correlationId: string;
  entityType?: string;
  entityId?: string;
  navigationTarget?: string;
  metadata?: Readonly<Record<string, string>>;
  idempotencyKey?: string;
}>;

export type NotificationReadPort = {
  list(tenantId: string, userId: string, filter?: NotificationListFilter): Promise<NotificationListResult>;
  getUnreadCount(tenantId: string, userId: string): Promise<number>;
};

export type NotificationWritePort = {
  create(input: NotificationCreateInput): Promise<NotificationReadModel>;
  markRead(tenantId: string, userId: string, notificationId: string): Promise<void>;
  markUnread(tenantId: string, userId: string, notificationId: string): Promise<void>;
  markAllRead(tenantId: string, userId: string): Promise<void>;
  archive(tenantId: string, userId: string, notificationId: string): Promise<void>;
};

export type TaskWritePort = {
  create(input: TaskCreateInput): Promise<TaskReadModel>;
  assign(tenantId: string, taskId: string, assigneeId: string, actorId: string): Promise<TaskReadModel>;
  reassign(tenantId: string, taskId: string, assigneeId: string, actorId: string): Promise<TaskReadModel>;
  start(tenantId: string, taskId: string, actorId: string): Promise<TaskReadModel>;
  pause(tenantId: string, taskId: string, actorId: string): Promise<TaskReadModel>;
  complete(tenantId: string, taskId: string, completedBy: string): Promise<TaskReadModel>;
  cancel(tenantId: string, taskId: string, actorId: string, reason?: string): Promise<TaskReadModel>;
  updatePriority(tenantId: string, taskId: string, priority: TaskPriority): Promise<TaskReadModel>;
  updateDueDate(tenantId: string, taskId: string, dueAt: string | null): Promise<TaskReadModel>;
};

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type TaskCreateInput = Readonly<{
  tenantId: string;
  title: string;
  assigneeId: string;
  entityType?: string;
  entityId?: string;
  dueAt?: string;
  priority?: TaskPriority;
  description?: string;
  parentTaskId?: string;
}>;

export type TaskReadModel = Readonly<{
  id: string;
  title: string;
  assigneeId: string;
  assigneeName?: string;
  createdAt: string;
  completedAt?: string;
  dueAt?: string;
  status: string;
  priority?: TaskPriority;
  entityType?: string;
  entityId?: string;
}>;

export type GlobalSearchReadPort = {
  search(tenantId: string, query: string, limit?: number): Promise<GlobalSearchResultModel[]>;
};

export type GlobalSearchResultModel = Readonly<{
  id: string;
  type: string;
  title: string;
  subtitle: string;
  preview: string;
  score: number;
}>;

export type FileWritePort = {
  upload(input: FileUploadInput): Promise<FileReadModel>;
};

export type FileUploadInput = Readonly<{
  tenantId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  entityType?: string;
  entityId?: string;
}>;

export type FileReadPort = {
  listForEntity(tenantId: string, entityType: string, entityId: string, limit?: number): Promise<FileReadModel[]>;
};

export type FileReadModel = Readonly<{
  id: string;
  fileName: string;
  uploadedAt: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string | null;
}>;

export type TaskReadPort = {
  listForEntity(tenantId: string, entityType: string, entityId: string, limit?: number): Promise<TaskReadModel[]>;
};

export type WorkflowWritePort = {
  execute(tenantId: string, workflowId: string, payload?: Record<string, unknown>): Promise<WorkflowExecutionModel>;
  start(tenantId: string, workflowId: string, payload?: Record<string, unknown>): Promise<WorkflowExecutionModel>;
  pause(tenantId: string, executionId: string): Promise<WorkflowExecutionModel>;
  resume(tenantId: string, executionId: string, payload?: Record<string, unknown>): Promise<WorkflowExecutionModel>;
  complete(tenantId: string, executionId: string): Promise<WorkflowExecutionModel>;
  cancel(tenantId: string, executionId: string, reason?: string): Promise<WorkflowExecutionModel>;
};

export type WorkflowExecutionModel = Readonly<{
  id: string;
  workflowId: string;
  status: "success" | "failed" | "skipped" | "running" | "paused" | "cancelled" | "completed";
  executedAt: string;
}>;

export type KnowledgeReadPort = {
  getDocument(tenantId: string, documentId: string): Promise<KnowledgeDocumentModel | null>;
  search(tenantId: string, query: string, options?: KnowledgeSearchOptions): Promise<KnowledgeSearchResult>;
};

export type KnowledgePublishInput = Readonly<{
  tenantId: string;
  documentId: string;
  title: string;
  actorUserId: string;
}>;

export type KnowledgeWritePort = {
  publishDocument(input: KnowledgePublishInput): Promise<KnowledgeDocumentModel>;
};

export type KnowledgeSearchOptions = Readonly<{
  limit?: number;
  entityType?: string;
  entityId?: string;
}>;

export type KnowledgeSearchResult = Readonly<{
  query: string;
  documents: readonly KnowledgeDocumentModel[];
  chunks: readonly KnowledgeChunkModel[];
  confidence: number;
}>;

export type KnowledgeChunkModel = Readonly<{
  id: string;
  content: string;
  documentId: string;
  documentTitle?: string;
  score: number;
}>;

export type KnowledgeDocumentModel = Readonly<{
  id: string;
  title: string;
  updatedAt: string;
}>;

export type OperationsWorkspaceReadPort = {
  getConfig(tenantId: string, templateKey: string): Promise<OperationsWorkspaceConfigModel | null>;
};

export type OperationsWorkspaceConfigModel = Readonly<{
  id: string;
  companyId: string;
  templateKey: string;
  config: Record<string, unknown>;
  updatedAt: string;
}>;

import type { AnalyticsTimePeriod } from "../dto/query-dtos.js";

export type { AnalyticsTimePeriod };

export type AnalyticsFilter = Readonly<{
  period?: AnalyticsTimePeriod;
  comparePrevious?: boolean;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  serviceId?: string;
  from?: string;
  to?: string;
}>;

export type AnalyticsKpiValue = Readonly<{
  key: string;
  label: string;
  value: number;
  previousValue?: number;
  unit?: "currency" | "count" | "percent" | "minutes" | "hours";
  trend?: "up" | "down" | "flat";
  category?: string;
}>;

export type AnalyticsChartPoint = Readonly<{
  label: string;
  value: number;
}>;

export type AnalyticsRankedItem = Readonly<{
  id: string;
  name: string;
  value: number;
  count?: number;
}>;

export type ExecutiveAnalyticsSnapshotModel = Readonly<{
  capturedAt: string;
  currency: string;
  kpis: readonly AnalyticsKpiValue[];
  charts: Readonly<Record<string, readonly AnalyticsChartPoint[]>>;
  rankings: Readonly<{
    customers: readonly AnalyticsRankedItem[];
    employees: readonly AnalyticsRankedItem[];
    services: readonly AnalyticsRankedItem[];
    branches: readonly AnalyticsRankedItem[];
  }>;
  breakdowns: Readonly<{
    revenueByBranch: readonly AnalyticsRankedItem[];
    revenueByEmployee: readonly AnalyticsRankedItem[];
    revenueByService: readonly AnalyticsRankedItem[];
    paymentMethods: readonly AnalyticsRankedItem[];
  }>;
}>;

export type AnalyticsReadPort = {
  getMetrics(tenantId: string, templateKey: string, metrics?: string[]): Promise<AnalyticsMetricModel[]>;
  getExecutiveSnapshot(tenantId: string, filter: AnalyticsFilter): Promise<ExecutiveAnalyticsSnapshotModel>;
};

export type AnalyticsMetricModel = Readonly<{
  id: string;
  label: string;
  value: string;
  trend?: string;
}>;

export type EmployeeReadPort = {
  getWorkload(tenantId: string, employeeId: string, date: string): Promise<EmployeeWorkloadModel>;
  listTopEmployees(tenantId: string, filter: AnalyticsFilter, limit?: number): Promise<readonly AnalyticsRankedItem[]>;
};

export type EmployeeWorkloadModel = Readonly<{
  employeeId: string;
  employeeName: string;
  bookingsToday: number;
  hoursScheduled: number;
  utilizationPercent: number;
}>;

export type RevenueReadPort = {
  getSummary(tenantId: string, period: string, branchId?: string): Promise<RevenueSummaryModel>;
  getBreakdown(
    tenantId: string,
    dimension: "branch" | "employee" | "service" | "provider",
    filter: AnalyticsFilter,
  ): Promise<readonly AnalyticsRankedItem[]>;
};

export type RevenueSummaryModel = Readonly<{
  totalCents: number;
  currency: string;
  period: string;
  trend: string;
}>;

import type { HandoffWritePort } from "./handoff-ports.js";
import type { SchedulingQueryPort } from "./scheduling-query-port.js";
import type { TicketReadPort, TicketWritePort } from "./ticket-ports.js";

/** Aggregates all repository ports for DI. */
export type ApplicationPorts = Readonly<{
  customerRead: CustomerReadPort;
  customerWrite: CustomerWritePort;
  leadRead: LeadReadPort;
  leadWrite: LeadWritePort;
  bookingRead: BookingReadPort;
  bookingWrite: BookingWritePort;
  paymentRead: PaymentReadPort;
  paymentWrite: PaymentWritePort;
  invoiceRead: InvoiceReadPort;
  invoiceWrite: InvoiceWritePort;
  timelineRead: TimelineReadPort;
  customerTagRead: CustomerTagReadPort;
  customerAddressRead: CustomerAddressReadPort;
  customerContactRead: CustomerContactReadPort;
  customerCustomFieldRead: CustomerCustomFieldReadPort;
  activityRead: ActivityReadPort;
  fileRead: FileReadPort;
  taskRead: TaskReadPort;
  globalSearchRead: GlobalSearchReadPort;
  notificationRead: NotificationReadPort;
  notificationWrite: NotificationWritePort;
  taskWrite: TaskWritePort;
  fileWrite: FileWritePort;
  workflowWrite: WorkflowWritePort;
  knowledgeRead: KnowledgeReadPort;
  knowledgeWrite: KnowledgeWritePort;
  schedulingQuery: SchedulingQueryPort;
  ticketRead: TicketReadPort;
  ticketWrite: TicketWritePort;
  handoffWrite: HandoffWritePort;
  analyticsRead: AnalyticsReadPort;
  employeeRead: EmployeeReadPort;
  revenueRead: RevenueReadPort;
  entityContactRead: EntityContactReadPort;
  entityContactWrite: EntityContactWritePort;
  entityFileRead: EntityFileReadPort;
  entityFileWrite: EntityFileWritePort;
  entityTagRead: EntityTagReadPort;
  entityTagWrite: EntityTagWritePort;
  entityCustomFieldRead: EntityCustomFieldReadPort;
  entityCustomFieldWrite: EntityCustomFieldWritePort;
  entityActivityRead: EntityActivityReadPort;
  entityActivityWrite: EntityActivityWritePort;
  entityRelationshipRead: EntityRelationshipReadPort;
  operationsWorkspaceRead: OperationsWorkspaceReadPort;
  configurationRead: ConfigurationReadPort;
  configurationWrite: ConfigurationWritePort;
  configurationCache: ConfigurationCachePort;
  featureFlagRead: FeatureFlagReadPort;
  featureFlagWrite: FeatureFlagWritePort;
  licenseRead: LicenseReadPort;
  licenseWrite: LicenseWritePort;
}>;
