import { ValidationError } from "../errors/application-errors.js";

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} is required`);
  }
}

function requirePositiveNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || value <= 0 || Number.isNaN(value)) {
    throw new ValidationError(`${field} must be a positive number`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("request must be an object");
  }
  return value as Record<string, unknown>;
}

export const commandValidators: Record<string, (request: unknown) => void> = {
  CreateCustomer: (request) => {
    const req = asRecord(request);
    requireString(req.displayName, "displayName");
  },
  UpdateCustomer: (request) => {
    const req = asRecord(request);
    requireString(req.customerId, "customerId");
    asRecord(req.patch);
  },
  ConvertLead: (request) => {
    requireString(asRecord(request).leadId, "leadId");
  },
  CreateBooking: (request) => {
    const req = asRecord(request);
    requireString(req.customerId, "customerId");
    requireString(req.scheduledAt, "scheduledAt");
  },
  RescheduleBooking: (request) => {
    const req = asRecord(request);
    requireString(req.bookingId, "bookingId");
    requireString(req.newScheduledAt, "newScheduledAt");
  },
  CancelBooking: (request) => {
    requireString(asRecord(request).bookingId, "bookingId");
  },
  CheckInCustomer: (request) => {
    requireString(asRecord(request).bookingId, "bookingId");
  },
  CheckOutCustomer: (request) => {
    requireString(asRecord(request).bookingId, "bookingId");
  },
  CollectPayment: (request) => {
    const req = asRecord(request);
    requireString(req.customerId, "customerId");
    requirePositiveNumber(req.amountCents, "amountCents");
    requireString(req.currency, "currency");
    requireString(req.method, "method");
  },
  RefundPayment: (request) => {
    const req = asRecord(request);
    requireString(req.paymentId, "paymentId");
    requirePositiveNumber(req.amountCents, "amountCents");
  },
  GenerateInvoice: (request) => {
    const req = asRecord(request);
    requireString(req.customerId, "customerId");
    requirePositiveNumber(req.amountCents, "amountCents");
    requireString(req.currency, "currency");
  },
  AssignEmployee: (request) => {
    const req = asRecord(request);
    requireString(req.bookingId, "bookingId");
    requireString(req.employeeId, "employeeId");
  },
  MarkNoShowBooking: (request) => {
    requireString(asRecord(request).bookingId, "bookingId");
  },
  CreateTask: (request) => {
    const req = asRecord(request);
    requireString(req.title, "title");
    requireString(req.assigneeId, "assigneeId");
  },
  CompleteTask: (request) => {
    requireString(asRecord(request).taskId, "taskId");
  },
  UploadFile: (request) => {
    const req = asRecord(request);
    requireString(req.fileName, "fileName");
    requireString(req.mimeType, "mimeType");
    requirePositiveNumber(req.sizeBytes, "sizeBytes");
  },
  ExecuteWorkflow: (request) => {
    requireString(asRecord(request).workflowId, "workflowId");
  },
  GenerateAISummary: (request) => {
    const req = asRecord(request);
    requireString(req.entityType, "entityType");
    requireString(req.entityId, "entityId");
  },
  MarkNotificationRead: (request) => {
    requireString(asRecord(request).notificationId, "notificationId");
  },
  MarkAllNotificationsRead: () => {},
  ArchiveNotification: (request) => {
    requireString(asRecord(request).notificationId, "notificationId");
  },
  CreateEntityContact: (request) => {
    const req = asRecord(request);
    requireString(req.entityType, "entityType");
    requireString(req.entityId, "entityId");
    requireString(req.displayName, "displayName");
  },
  UpdateEntityContact: (request) => {
    requireString(asRecord(request).contactId, "contactId");
  },
  CreateEntityActivity: (request) => {
    const req = asRecord(request);
    requireString(req.entityType, "entityType");
    requireString(req.entityId, "entityId");
    requireString(req.activityType, "activityType");
    requireString(req.subject, "subject");
  },
  AssignEntityTag: (request) => {
    const req = asRecord(request);
    requireString(req.entityType, "entityType");
    requireString(req.entityId, "entityId");
    requireString(req.tagId, "tagId");
  },
  CreateEntityFile: (request) => {
    const req = asRecord(request);
    requireString(req.entityType, "entityType");
    requireString(req.entityId, "entityId");
    requireString(req.fileName, "fileName");
    requireString(req.storagePath, "storagePath");
  },
  UpsertEntityCustomFieldValue: (request) => {
    const req = asRecord(request);
    requireString(req.entityType, "entityType");
    requireString(req.entityId, "entityId");
    requireString(req.fieldId, "fieldId");
  },
  CreateLead: (request) => {
    requireString(asRecord(request).title, "title");
  },
  UpdateLead: (request) => {
    requireString(asRecord(request).leadId, "leadId");
  },
  AssignLead: (request) => {
    const req = asRecord(request);
    requireString(req.leadId, "leadId");
    requireString(req.assigneeUserId, "assigneeUserId");
  },
  ChangeLeadStage: (request) => {
    const req = asRecord(request);
    requireString(req.leadId, "leadId");
    requireString(req.stageId, "stageId");
  },
  BulkChangeLeadStage: (request) => {
    const req = asRecord(request);
    requireString(req.stageId, "stageId");
  },
  ArchiveLead: (request) => {
    requireString(asRecord(request).leadId, "leadId");
  },
  SaveConfigurationDraft: (request) => {
    const req = asRecord(request);
    requireString(req.domain, "domain");
    requireString(req.scopeKey, "scopeKey");
  },
  PublishConfiguration: (request) => {
    const req = asRecord(request);
    requireString(req.domain, "domain");
    requireString(req.scopeKey, "scopeKey");
  },
  RollbackConfiguration: (request) => {
    const req = asRecord(request);
    requireString(req.configurationId, "configurationId");
    requirePositiveNumber(req.targetVersion, "targetVersion");
  },
  UpsertFeatureFlag: (request) => {
    const req = asRecord(request);
    requireString(req.featureKey, "featureKey");
    requireString(req.scopeType, "scopeType");
  },
};

export const queryValidators: Record<string, (request: unknown) => void> = {
  Customer360: (request) => {
    requireString(asRecord(request).customerId, "customerId");
  },
  Customer360Aggregate: (request) => {
    requireString(asRecord(request).customerId, "customerId");
  },
  OperationsQueue: () => {},
  Dashboard: () => {},
  Timeline: (request) => {
    const req = asRecord(request);
    requireString(req.entityType, "entityType");
    requireString(req.entityId, "entityId");
  },
  Revenue: () => {},
  EmployeeWorkload: () => {},
  Calendar: (request) => {
    const req = asRecord(request);
    requireString(req.from, "from");
    requireString(req.to, "to");
  },
  Analytics: () => {},
  ExecutiveInsights: () => {},
  OperationsAnalytics: () => {},
  BookingsAnalytics: () => {},
  PaymentsAnalytics: () => {},
  InvoicesAnalytics: () => {},
  ServicesAnalytics: () => {},
  BranchAnalytics: () => {},
  CustomerAnalytics: () => {},
  UtilizationAnalytics: () => {},
  NotificationCenter: () => {},
  Workspace: (request) => {
    const req = asRecord(request);
    requireString(req.entityType, "entityType");
    requireString(req.entityId, "entityId");
  },
  Lead360Aggregate: (request) => {
    requireString(asRecord(request).leadId, "leadId");
  },
  LeadList: () => {},
  LeadPipeline: (request) => {
    requireString(asRecord(request).pipelineId, "pipelineId");
  },
  LeadDashboard: () => {},
  Configuration: (request) => {
    requireString(asRecord(request).domain, "domain");
  },
  ConfigurationVersions: (request) => {
    requireString(asRecord(request).configurationId, "configurationId");
  },
  ResolveFeatureFlag: (request) => {
    requireString(asRecord(request).featureKey, "featureKey");
  },
  ResolveFeatureFlags: (request) => {
    const req = asRecord(request);
    if (!Array.isArray(req.featureKeys)) throw new ValidationError("featureKeys must be an array");
  },
  CanAccessFeature: (request) => {
    requireString(asRecord(request).featureKey, "featureKey");
  },
  SearchAvailability: () => {},
  FindNextAvailable: () => {},
  RecommendAppointment: () => {},
  SearchBookings: () => {},
  KnowledgeDocument: (request) => {
    requireString(asRecord(request).documentId, "documentId");
  },
  KnowledgeSearch: (request) => {
    requireString(asRecord(request).query, "query");
  },
  AssembleAIContext: () => {},
  TicketSearch: () => {},
};

export function validateCommand(commandType: string, request: unknown): void {
  const validator = commandValidators[commandType];
  if (!validator) throw new ValidationError(`Unknown command: ${commandType}`);
  validator(request);
}

export function validateQuery(queryType: string, request: unknown): void {
  const validator = queryValidators[queryType];
  if (!validator) throw new ValidationError(`Unknown query: ${queryType}`);
  validator(request);
}
