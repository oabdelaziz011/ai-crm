import type { PlatformEventEnvelope } from "./envelope.js";
import type {
  AISummaryGeneratedPayload,
  BookingCancelledPayload,
  BookingCompletedPayload,
  BookingConfirmedPayload,
  BookingCreatedPayload,
  ConfigurationUpdatedPayload,
  ConfigurationPublishedPayload,
  CustomerCreatedPayload,
  CustomerUpdatedPayload,
  EmailSentPayload,
  FileUploadedPayload,
  InvoiceGeneratedPayload,
  InvoicePaidPayload,
  KnowledgeUpdatedPayload,
  LeadConvertedPayload,
  LeadCreatedPayload,
  LeadUpdatedPayload,
  BookingNoShowPayload,
  BookingRescheduledPayload,
  TaskCreatedPayload,
  RefundCreatedPayload,
  WorkflowStartedPayload,
  WorkflowCompletedPayload,
  WorkflowCancelledPayload,
  FeatureFlagUpdatedPayload,
  LicenseChangedPayload,
  EmployeeAssignedPayload,
  ConversationTransferredPayload,
  ConversationStartedPayload,
  ConversationMessageReceivedPayload,
  LeadIntelligenceUpdatedPayload,
  LeadAnalysisRequestedPayload,
  NotificationCreatedPayload,
  PaymentCollectedPayload,
  PermissionChangedPayload,
  TaskAssignedPayload,
  TaskCompletedPayload,
  WhatsAppSentPayload,
  WorkflowExecutedPayload,
  OpportunityCreatedPayload,
  OpportunityStageChangedPayload,
  OpportunityProbabilityChangedPayload,
  OpportunityProductsAddedPayload,
  OpportunityQuoteCreatedPayload,
  OpportunityNegotiationStartedPayload,
  OpportunityWonPayload,
  OpportunityLostPayload,
  ProductCreatedPayload,
  ProductUpdatedPayload,
  ProductArchivedPayload,
  PriceChangedPayload,
  CategoryChangedPayload,
  QuoteCreatedPayload,
  QuoteUpdatedPayload,
  QuoteSentPayload,
  QuoteViewedPayload,
  QuoteAcceptedPayload,
  QuoteRejectedPayload,
  QuoteExpiredPayload,
  QuoteVersionCreatedPayload,
} from "./payloads.js";

export const PLATFORM_EVENT_TYPES = [
  "CustomerCreated",
  "CustomerUpdated",
  "LeadCreated",
  "LeadConverted",
  "BookingCreated",
  "BookingConfirmed",
  "BookingCancelled",
  "BookingCompleted",
  "PaymentCollected",
  "InvoiceGenerated",
  "InvoicePaid",
  "TaskAssigned",
  "TaskCompleted",
  "EmailSent",
  "WhatsAppSent",
  "NotificationCreated",
  "WorkflowExecuted",
  "AISummaryGenerated",
  "KnowledgeUpdated",
  "FileUploaded",
  "ConfigurationUpdated",
  "ConfigurationPublished",
  "PermissionChanged",
  "LeadUpdated",
  "BookingNoShow",
  "BookingRescheduled",
  "TaskCreated",
  "RefundCreated",
  "WorkflowStarted",
  "WorkflowCompleted",
  "WorkflowCancelled",
  "FeatureFlagUpdated",
  "LicenseChanged",
  "EmployeeAssigned",
  "ConversationTransferred",
  "ConversationStarted",
  "ConversationMessageReceived",
  "LeadIntelligenceUpdated",
  "LeadAnalysisRequested",
  "OpportunityCreated",
  "OpportunityStageChanged",
  "OpportunityProbabilityChanged",
  "OpportunityProductsAdded",
  "OpportunityQuoteCreated",
  "OpportunityNegotiationStarted",
  "OpportunityWon",
  "OpportunityLost",
  "ProductCreated",
  "ProductUpdated",
  "ProductArchived",
  "PriceChanged",
  "CategoryChanged",
  "QuoteCreated",
  "QuoteUpdated",
  "QuoteSent",
  "QuoteViewed",
  "QuoteAccepted",
  "QuoteRejected",
  "QuoteExpired",
  "QuoteVersionCreated",
] as const;

export type PlatformEventType = (typeof PLATFORM_EVENT_TYPES)[number];

export type PlatformEventMap = {
  CustomerCreated: CustomerCreatedPayload;
  CustomerUpdated: CustomerUpdatedPayload;
  LeadCreated: LeadCreatedPayload;
  LeadConverted: LeadConvertedPayload;
  BookingCreated: BookingCreatedPayload;
  BookingConfirmed: BookingConfirmedPayload;
  BookingCancelled: BookingCancelledPayload;
  BookingCompleted: BookingCompletedPayload;
  PaymentCollected: PaymentCollectedPayload;
  InvoiceGenerated: InvoiceGeneratedPayload;
  InvoicePaid: InvoicePaidPayload;
  TaskAssigned: TaskAssignedPayload;
  TaskCompleted: TaskCompletedPayload;
  EmailSent: EmailSentPayload;
  WhatsAppSent: WhatsAppSentPayload;
  NotificationCreated: NotificationCreatedPayload;
  WorkflowExecuted: WorkflowExecutedPayload;
  AISummaryGenerated: AISummaryGeneratedPayload;
  KnowledgeUpdated: KnowledgeUpdatedPayload;
  FileUploaded: FileUploadedPayload;
  ConfigurationUpdated: ConfigurationUpdatedPayload;
  ConfigurationPublished: ConfigurationPublishedPayload;
  PermissionChanged: PermissionChangedPayload;
  LeadUpdated: LeadUpdatedPayload;
  BookingNoShow: BookingNoShowPayload;
  BookingRescheduled: BookingRescheduledPayload;
  TaskCreated: TaskCreatedPayload;
  RefundCreated: RefundCreatedPayload;
  WorkflowStarted: WorkflowStartedPayload;
  WorkflowCompleted: WorkflowCompletedPayload;
  WorkflowCancelled: WorkflowCancelledPayload;
  FeatureFlagUpdated: FeatureFlagUpdatedPayload;
  LicenseChanged: LicenseChangedPayload;
  EmployeeAssigned: EmployeeAssignedPayload;
  ConversationTransferred: ConversationTransferredPayload;
  ConversationStarted: ConversationStartedPayload;
  ConversationMessageReceived: ConversationMessageReceivedPayload;
  LeadIntelligenceUpdated: LeadIntelligenceUpdatedPayload;
  LeadAnalysisRequested: LeadAnalysisRequestedPayload;
  OpportunityCreated: OpportunityCreatedPayload;
  OpportunityStageChanged: OpportunityStageChangedPayload;
  OpportunityProbabilityChanged: OpportunityProbabilityChangedPayload;
  OpportunityProductsAdded: OpportunityProductsAddedPayload;
  OpportunityQuoteCreated: OpportunityQuoteCreatedPayload;
  OpportunityNegotiationStarted: OpportunityNegotiationStartedPayload;
  OpportunityWon: OpportunityWonPayload;
  OpportunityLost: OpportunityLostPayload;
  ProductCreated: ProductCreatedPayload;
  ProductUpdated: ProductUpdatedPayload;
  ProductArchived: ProductArchivedPayload;
  PriceChanged: PriceChangedPayload;
  CategoryChanged: CategoryChangedPayload;
  QuoteCreated: QuoteCreatedPayload;
  QuoteUpdated: QuoteUpdatedPayload;
  QuoteSent: QuoteSentPayload;
  QuoteViewed: QuoteViewedPayload;
  QuoteAccepted: QuoteAcceptedPayload;
  QuoteRejected: QuoteRejectedPayload;
  QuoteExpired: QuoteExpiredPayload;
  QuoteVersionCreated: QuoteVersionCreatedPayload;
};

export type PlatformEvent = {
  [K in PlatformEventType]: PlatformEventEnvelope<K, PlatformEventMap[K]>;
}[PlatformEventType];

export type TypedPlatformEvent<T extends PlatformEventType> = PlatformEventEnvelope<
  T,
  PlatformEventMap[T]
>;
