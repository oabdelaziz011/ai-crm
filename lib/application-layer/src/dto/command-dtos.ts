// ── Customer ──────────────────────────────────────────────────────────────
export type CreateCustomerRequestDto = Readonly<{
  displayName: string;
  email?: string;
  phone?: string;
  leadSource?: string;
}>;

export type CreateCustomerResponseDto = Readonly<{
  customerId: string;
  displayName: string;
  createdAt: string;
}>;

export type UpdateCustomerRequestDto = Readonly<{
  customerId: string;
  patch: Readonly<Record<string, unknown>>;
}>;

export type UpdateCustomerResponseDto = Readonly<{
  customerId: string;
  updatedFields: readonly string[];
  updatedAt: string;
}>;

export type ConvertLeadRequestDto = Readonly<{
  leadId: string;
  customerDisplayName?: string;
}>;

export type ConvertLeadResponseDto = Readonly<{
  leadId: string;
  customerId: string;
  convertedAt: string;
  opportunityId?: string | null;
}>;

// ── Booking ───────────────────────────────────────────────────────────────
export type CreateBookingRequestDto = Readonly<{
  customerId: string;
  scheduledAt: string;
  serviceId?: string;
  employeeId?: string;
}>;

export type CreateBookingResponseDto = Readonly<{
  bookingId: string;
  customerId: string;
  scheduledAt: string;
  status: string;
}>;

export type RescheduleBookingRequestDto = Readonly<{
  bookingId: string;
  newScheduledAt: string;
  reason?: string;
}>;

export type RescheduleBookingResponseDto = Readonly<{
  bookingId: string;
  scheduledAt: string;
  rescheduledAt: string;
}>;

export type CancelBookingRequestDto = Readonly<{
  bookingId: string;
  reason?: string;
}>;

export type CancelBookingResponseDto = Readonly<{
  bookingId: string;
  cancelledAt: string;
  status: string;
}>;

export type CheckInCustomerRequestDto = Readonly<{
  bookingId: string;
  roomId?: string;
}>;

export type CheckInCustomerResponseDto = Readonly<{
  bookingId: string;
  checkedInAt: string;
  status: string;
}>;

export type CheckOutCustomerRequestDto = Readonly<{
  bookingId: string;
}>;

export type CheckOutCustomerResponseDto = Readonly<{
  bookingId: string;
  checkedOutAt: string;
  status: string;
}>;

export type TransitionClinicStatusRequestDto = Readonly<{
  bookingId: string;
  status: "with_nurse" | "in_progress" | "archived";
}>;

export type TransitionClinicStatusResponseDto = Readonly<{
  bookingId: string;
  status: string;
  transitionedAt: string;
}>;

export type CompleteTriageRequestDto = Readonly<{
  bookingId: string;
}>;

export type CompleteTriageResponseDto = Readonly<{
  bookingId: string;
  status: string;
  completedAt: string;
}>;

// ── Payment / Invoice ─────────────────────────────────────────────────────
export type CollectPaymentRequestDto = Readonly<{
  customerId: string;
  amountCents: number;
  currency: string;
  method: string;
  invoiceId?: string;
  bookingId?: string;
  discountCents?: number;
  taxCents?: number;
  serviceDescription?: string;
  servicePriceCents?: number;
}>;

export type CollectPaymentResponseDto = Readonly<{
  paymentId: string;
  customerId: string;
  amountCents: number;
  collectedAt: string;
}>;

export type RefundPaymentRequestDto = Readonly<{
  paymentId: string;
  amountCents: number;
  reason?: string;
}>;

export type RefundPaymentResponseDto = Readonly<{
  refundId: string;
  paymentId: string;
  amountCents: number;
  refundedAt: string;
}>;

export type GenerateInvoiceRequestDto = Readonly<{
  customerId: string;
  amountCents: number;
  currency: string;
  dueAt?: string;
  lineItems?: readonly Readonly<{ description: string; amountCents: number }>[];
}>;

export type GenerateInvoiceResponseDto = Readonly<{
  invoiceId: string;
  customerId: string;
  amountCents: number;
  generatedAt: string;
}>;

// ── Operations ──────────────────────────────────────────────────────────
export type AssignEmployeeRequestDto = Readonly<{
  bookingId: string;
  employeeId: string;
}>;

export type AssignEmployeeResponseDto = Readonly<{
  bookingId: string;
  employeeId: string;
  assignedAt: string;
}>;

export type MarkNoShowBookingRequestDto = Readonly<{
  bookingId: string;
  gracePeriodMinutes?: number;
}>;

export type MarkNoShowBookingResponseDto = Readonly<{
  bookingId: string;
  status: string;
  markedAt: string;
}>;

export type CreateTaskRequestDto = Readonly<{
  title: string;
  assigneeId: string;
  entityType?: string;
  entityId?: string;
  dueAt?: string;
}>;

export type CreateTaskResponseDto = Readonly<{
  taskId: string;
  title: string;
  createdAt: string;
}>;

export type CompleteTaskRequestDto = Readonly<{
  taskId: string;
}>;

export type CompleteTaskResponseDto = Readonly<{
  taskId: string;
  completedAt: string;
}>;

export type UploadFileRequestDto = Readonly<{
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  entityType?: string;
  entityId?: string;
}>;

export type UploadFileResponseDto = Readonly<{
  fileId: string;
  fileName: string;
  uploadedAt: string;
}>;

export type ExecuteWorkflowRequestDto = Readonly<{
  workflowId: string;
  triggerPayload?: Readonly<Record<string, unknown>>;
}>;

export type ExecuteWorkflowResponseDto = Readonly<{
  executionId: string;
  workflowId: string;
  status: "success" | "failed" | "skipped";
  executedAt: string;
}>;

export type GenerateAISummaryRequestDto = Readonly<{
  entityType: string;
  entityId: string;
  model?: string;
}>;

export type GenerateAISummaryResponseDto = Readonly<{
  summaryId: string;
  entityType: string;
  entityId: string;
  preview: string;
  generatedAt: string;
}>;

export type MarkNotificationReadRequestDto = Readonly<{
  notificationId: string;
}>;

export type MarkNotificationReadResponseDto = Readonly<{
  notificationId: string;
  readAt: string;
}>;

export type MarkAllNotificationsReadResponseDto = Readonly<{
  markedCount: number;
  readAt: string;
}>;

export type ArchiveNotificationRequestDto = Readonly<{
  notificationId: string;
}>;

export type ArchiveNotificationResponseDto = Readonly<{
  notificationId: string;
  archivedAt: string;
}>;
