export const COMMAND_TYPES = [
  "CreateCustomer",
  "UpdateCustomer",
  "ConvertLead",
  "CreateBooking",
  "RescheduleBooking",
  "CancelBooking",
  "CheckInCustomer",
  "CheckOutCustomer",
  "CollectPayment",
  "RefundPayment",
  "GenerateInvoice",
  "AssignEmployee",
  "MarkNoShowBooking",
  "CreateTask",
  "CompleteTask",
  "UploadFile",
  "ExecuteWorkflow",
  "GenerateAISummary",
  "MarkNotificationRead",
  "MarkAllNotificationsRead",
  "ArchiveNotification",
  "CreateEntityContact",
  "UpdateEntityContact",
  "CreateEntityActivity",
  "AssignEntityTag",
  "CreateEntityFile",
  "UpsertEntityCustomFieldValue",
  "CreateLead",
  "UpdateLead",
  "AssignLead",
  "ChangeLeadStage",
  "BulkChangeLeadStage",
  "ArchiveLead",
  "SaveConfigurationDraft",
  "PublishConfiguration",
  "RollbackConfiguration",
  "UpsertFeatureFlag",
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export const QUERY_TYPES = [
  "Customer360",
  "Customer360Aggregate",
  "OperationsQueue",
  "Dashboard",
  "Timeline",
  "Revenue",
  "EmployeeWorkload",
  "Calendar",
  "Analytics",
  "NotificationCenter",
  "Workspace",
  "ExecutiveInsights",
  "OperationsAnalytics",
  "BookingsAnalytics",
  "PaymentsAnalytics",
  "InvoicesAnalytics",
  "ServicesAnalytics",
  "BranchAnalytics",
  "CustomerAnalytics",
  "UtilizationAnalytics",
  "Lead360Aggregate",
  "LeadList",
  "LeadPipeline",
  "LeadDashboard",
  "Configuration",
  "ConfigurationVersions",
  "ResolveFeatureFlag",
  "ResolveFeatureFlags",
  "CanAccessFeature",
  "SearchAvailability",
  "FindNextAvailable",
  "RecommendAppointment",
  "SearchBookings",
  "KnowledgeDocument",
  "KnowledgeSearch",
  "AssembleAIContext",
  "TicketSearch",
] as const;

export type QueryType = (typeof QUERY_TYPES)[number];

export type CommandDefinition<TRequest, TResponse> = {
  type: CommandType;
  request: TRequest;
  response: TResponse;
};

export type QueryDefinition<TRequest, TResponse> = {
  type: QueryType;
  request: TRequest;
  response: TResponse;
};
