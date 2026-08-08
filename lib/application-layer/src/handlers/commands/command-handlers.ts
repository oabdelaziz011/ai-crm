import type { ApplicationPorts } from "../../ports/repository-ports.js";
import type { InfrastructurePorts } from "../../ports/infrastructure-ports.js";
import type { ApplicationContext } from "../../contracts/application-context.js";
import type {
  UpdateCustomerRequestDto,
  UpdateCustomerResponseDto,
  CreateCustomerRequestDto,
  CreateCustomerResponseDto,
  CreateBookingRequestDto,
  CreateBookingResponseDto,
  CancelBookingRequestDto,
  CancelBookingResponseDto,
  CheckOutCustomerRequestDto,
  CheckOutCustomerResponseDto,
  CheckInCustomerRequestDto,
  CheckInCustomerResponseDto,
  RescheduleBookingRequestDto,
  RescheduleBookingResponseDto,
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
  MarkNoShowBookingRequestDto,
  MarkNoShowBookingResponseDto,
  GenerateAISummaryRequestDto,
  GenerateAISummaryResponseDto,
  MarkNotificationReadRequestDto,
  MarkNotificationReadResponseDto,
  MarkAllNotificationsReadResponseDto,
  ArchiveNotificationRequestDto,
  ArchiveNotificationResponseDto,
} from "../../dto/command-dtos.js";
import { ResourceNotFoundError } from "../../errors/application-errors.js";

export type CommandHandlerDeps = Readonly<{
  ports: ApplicationPorts;
  infra: InfrastructurePorts;
}>;

function eventContext(context: ApplicationContext) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    actorId: context.actorId,
    actorType: context.actorType,
    correlationId: context.correlationId,
  };
}

export async function handleUpdateCustomer(
  deps: CommandHandlerDeps,
  request: UpdateCustomerRequestDto,
  context: ApplicationContext,
): Promise<{ response: UpdateCustomerResponseDto; eventIds: string[] }> {
  const changedFields = Object.keys(request.patch);
  const customer = await deps.ports.customerWrite.update(context.tenantId, request.customerId, request.patch);
  const updatedAt = new Date().toISOString();
  const eventId = await deps.infra.events.publishCustomerUpdated({
    customerId: customer.id,
    changedFields,
    patch: request.patch,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      customerId: customer.id,
      updatedFields: changedFields,
      updatedAt,
    }),
    eventIds: [eventId],
  };
}

export async function handleCreateCustomer(
  deps: CommandHandlerDeps,
  request: CreateCustomerRequestDto,
  context: ApplicationContext,
): Promise<{ response: CreateCustomerResponseDto; eventIds: string[] }> {
  const customer = await deps.ports.customerWrite.create({
    tenantId: context.tenantId,
    displayName: request.displayName,
    email: request.email,
    phone: request.phone,
    leadSource: request.leadSource,
  });
  const eventId = await deps.infra.events.publishCustomerCreated({
    customerId: customer.id,
    displayName: customer.displayName,
    email: customer.email,
    phone: customer.phone,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      customerId: customer.id,
      displayName: customer.displayName,
      createdAt: customer.createdAt,
    }),
    eventIds: [eventId],
  };
}

export async function handleCreateBooking(
  deps: CommandHandlerDeps,
  request: CreateBookingRequestDto,
  context: ApplicationContext,
): Promise<{ response: CreateBookingResponseDto; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.create({
    tenantId: context.tenantId,
    customerId: request.customerId,
    scheduledAt: request.scheduledAt,
    serviceId: request.serviceId,
    employeeId: request.employeeId,
  });
  const eventId = await deps.infra.events.publishBookingCreated({
    bookingId: booking.id,
    customerId: booking.customerId,
    scheduledAt: booking.scheduledAt,
    serviceId: request.serviceId,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      bookingId: booking.id,
      customerId: booking.customerId,
      scheduledAt: booking.scheduledAt,
      status: booking.status,
    }),
    eventIds: [eventId],
  };
}

export async function handleCancelBooking(
  deps: CommandHandlerDeps,
  request: CancelBookingRequestDto,
  context: ApplicationContext,
): Promise<{ response: CancelBookingResponseDto; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.cancel(context.tenantId, request.bookingId, request.reason);
  const cancelledAt = new Date().toISOString();
  const eventId = await deps.infra.events.publishBookingCancelled({
    bookingId: booking.id,
    customerId: booking.customerId,
    reason: request.reason,
    cancelledAt,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({ bookingId: booking.id, cancelledAt, status: booking.status }),
    eventIds: [eventId],
  };
}

export async function handleCheckOutCustomer(
  deps: CommandHandlerDeps,
  request: CheckOutCustomerRequestDto,
  context: ApplicationContext,
): Promise<{ response: CheckOutCustomerResponseDto; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.checkOut(context.tenantId, request.bookingId);
  const completedAt = new Date().toISOString();
  const eventId = await deps.infra.events.publishBookingCompleted({
    bookingId: booking.id,
    customerId: booking.customerId,
    completedAt,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({ bookingId: booking.id, checkedOutAt: completedAt, status: booking.status }),
    eventIds: [eventId],
  };
}

export async function handleCheckInCustomer(
  deps: CommandHandlerDeps,
  request: CheckInCustomerRequestDto,
  context: ApplicationContext,
): Promise<{ response: CheckInCustomerResponseDto; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.checkIn(context.tenantId, request.bookingId, request.roomId);
  const checkedInAt = new Date().toISOString();
  return {
    response: Object.freeze({ bookingId: booking.id, checkedInAt, status: booking.status }),
    eventIds: [],
  };
}

export async function handleTransitionClinicStatus(
  deps: CommandHandlerDeps,
  request: { bookingId: string; status: "with_nurse" | "in_progress" | "archived" },
  context: ApplicationContext,
): Promise<{ response: { bookingId: string; status: string; transitionedAt: string }; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.transitionClinicStatus(
    context.tenantId,
    request.bookingId,
    request.status,
  );
  const transitionedAt = new Date().toISOString();
  return {
    response: Object.freeze({ bookingId: booking.id, status: booking.status, transitionedAt }),
    eventIds: [],
  };
}

export async function handleCompleteTriage(
  deps: CommandHandlerDeps,
  request: { bookingId: string },
  context: ApplicationContext,
): Promise<{ response: { bookingId: string; status: string; completedAt: string }; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.completeTriage(context.tenantId, request.bookingId);
  const completedAt = new Date().toISOString();
  return {
    response: Object.freeze({ bookingId: booking.id, status: booking.status, completedAt }),
    eventIds: [],
  };
}

export async function handleRescheduleBooking(
  deps: CommandHandlerDeps,
  request: RescheduleBookingRequestDto,
  context: ApplicationContext,
): Promise<{ response: RescheduleBookingResponseDto; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.reschedule(
    context.tenantId,
    request.bookingId,
    request.newScheduledAt,
  );
  const rescheduledAt = new Date().toISOString();
  const eventId = await deps.infra.events.publishBookingRescheduled({
    bookingId: booking.id,
    customerId: booking.customerId,
    scheduledAt: booking.scheduledAt,
    rescheduledAt,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      bookingId: booking.id,
      scheduledAt: booking.scheduledAt,
      rescheduledAt,
    }),
    eventIds: [eventId],
  };
}

export async function handleAssignEmployee(
  deps: CommandHandlerDeps,
  request: AssignEmployeeRequestDto,
  context: ApplicationContext,
): Promise<{ response: AssignEmployeeResponseDto; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.assignEmployee(
    context.tenantId,
    request.bookingId,
    request.employeeId,
  );
  const assignedAt = new Date().toISOString();
  const eventId = await deps.infra.events.publishEmployeeAssigned({
    employeeId: request.employeeId,
    bookingId: booking.id,
    customerId: booking.customerId,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      bookingId: booking.id,
      employeeId: request.employeeId,
      assignedAt,
    }),
    eventIds: [eventId],
  };
}

function mapWorkflowExecutionStatus(
  status: string,
): ExecuteWorkflowResponseDto["status"] {
  if (status === "failed") return "failed";
  if (status === "skipped" || status === "cancelled") return "skipped";
  return "success";
}

export async function handleExecuteWorkflow(
  deps: CommandHandlerDeps,
  request: ExecuteWorkflowRequestDto,
  context: ApplicationContext,
): Promise<{ response: ExecuteWorkflowResponseDto; eventIds: string[] }> {
  const execution = await deps.ports.workflowWrite.execute(
    context.tenantId,
    request.workflowId,
    request.triggerPayload ? { ...request.triggerPayload } : undefined,
  );
  const startedEventId = await deps.infra.events.publishWorkflowStarted({
    workflowId: execution.workflowId,
    workflowName: execution.workflowId,
    triggerEventType: "ManualExecute",
    context: eventContext(context),
  });
  const mappedStatus = mapWorkflowExecutionStatus(execution.status);
  const eventId = await deps.infra.events.publishWorkflowExecuted({
    workflowId: execution.workflowId,
    workflowName: execution.workflowId,
    triggerEventType: "ManualExecute",
    status: mappedStatus,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      executionId: execution.id,
      workflowId: execution.workflowId,
      status: mappedStatus,
      executedAt: execution.executedAt,
    }),
    eventIds: [startedEventId, eventId],
  };
}

export async function handleCollectPayment(
  deps: CommandHandlerDeps,
  request: CollectPaymentRequestDto,
  context: ApplicationContext,
): Promise<{ response: CollectPaymentResponseDto; eventIds: string[] }> {
  const payment = await deps.ports.paymentWrite.collect({
    tenantId: context.tenantId,
    customerId: request.customerId,
    amountCents: request.amountCents,
    currency: request.currency,
    method: request.method,
    invoiceId: request.invoiceId,
    bookingId: request.bookingId,
    discountCents: request.discountCents,
    taxCents: request.taxCents,
    serviceDescription: request.serviceDescription,
    servicePriceCents: request.servicePriceCents,
  });
  const eventId = await deps.infra.events.publishPaymentCollected({
    paymentId: payment.id,
    customerId: payment.customerId,
    amountCents: payment.amountCents,
    currency: payment.currency,
    method: payment.method,
    invoiceId: request.invoiceId,
    context: eventContext(context),
  });
  const eventIds = [eventId];
  const invoiceIdForEvent = request.invoiceId ?? payment.invoiceId;
  if (invoiceIdForEvent) {
    const invoicePaidId = await deps.infra.events.publishInvoicePaid({
      invoiceId: invoiceIdForEvent,
      customerId: payment.customerId,
      paidAt: payment.collectedAt,
      amountCents: payment.amountCents,
      context: eventContext(context),
    });
    eventIds.push(invoicePaidId);
  }
  return {
    response: Object.freeze({
      paymentId: payment.id,
      customerId: payment.customerId,
      amountCents: payment.amountCents,
      collectedAt: payment.collectedAt,
    }),
    eventIds: eventIds,
  };
}

export async function handleGenerateInvoice(
  deps: CommandHandlerDeps,
  request: GenerateInvoiceRequestDto,
  context: ApplicationContext,
): Promise<{ response: GenerateInvoiceResponseDto; eventIds: string[] }> {
  const invoice = await deps.ports.invoiceWrite.generate({
    tenantId: context.tenantId,
    customerId: request.customerId,
    amountCents: request.amountCents,
    currency: request.currency,
    dueAt: request.dueAt,
  });
  const eventId = await deps.infra.events.publishInvoiceGenerated({
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    dueAt: request.dueAt,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amountCents: invoice.amountCents,
      generatedAt: invoice.generatedAt,
    }),
    eventIds: [eventId],
  };
}

export async function handleConvertLead(
  deps: CommandHandlerDeps,
  request: ConvertLeadRequestDto,
  context: ApplicationContext,
): Promise<{ response: ConvertLeadResponseDto; eventIds: string[] }> {
  const lead = await deps.ports.leadRead.getById(context.tenantId, request.leadId);
  if (!lead) throw new ResourceNotFoundError("Lead", request.leadId);

  const customer = await deps.ports.customerWrite.create({
    tenantId: context.tenantId,
    displayName: request.customerDisplayName ?? lead.name,
  });
  await deps.ports.leadWrite.convert(context.tenantId, request.leadId, customer.id);
  const convertedAt = new Date().toISOString();
  const eventId = await deps.infra.events.publishLeadConverted({
    leadId: request.leadId,
    customerId: customer.id,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({ leadId: request.leadId, customerId: customer.id, convertedAt }),
    eventIds: [eventId],
  };
}

export async function handleMarkNoShowBooking(
  deps: CommandHandlerDeps,
  request: MarkNoShowBookingRequestDto,
  context: ApplicationContext,
): Promise<{ response: MarkNoShowBookingResponseDto; eventIds: string[] }> {
  const booking = await deps.ports.bookingWrite.markNoShow(
    context.tenantId,
    request.bookingId,
    request.gracePeriodMinutes,
  );
  const markedAt = new Date().toISOString();
  const eventId = await deps.infra.events.publishBookingNoShow({
    bookingId: booking.id,
    customerId: booking.customerId,
    markedAt,
    gracePeriodMinutes: request.gracePeriodMinutes,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({ bookingId: booking.id, status: booking.status, markedAt }),
    eventIds: [eventId],
  };
}

export async function handleCreateTask(
  deps: CommandHandlerDeps,
  request: CreateTaskRequestDto,
  context: ApplicationContext,
): Promise<{ response: CreateTaskResponseDto; eventIds: string[] }> {
  const task = await deps.ports.taskWrite.create({
    tenantId: context.tenantId,
    title: request.title,
    assigneeId: request.assigneeId,
    entityType: request.entityType,
    entityId: request.entityId,
    dueAt: request.dueAt,
  });
  const createdEventId = await deps.infra.events.publishTaskCreated({
    taskId: task.id,
    title: task.title,
    assigneeId: task.assigneeId,
    entityType: request.entityType,
    entityId: request.entityId,
    context: eventContext(context),
  });
  const assignedEventId = await deps.infra.events.publishTaskAssigned({
    taskId: task.id,
    assigneeId: task.assigneeId,
    title: task.title,
    entityType: request.entityType,
    entityId: request.entityId,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({ taskId: task.id, title: task.title, createdAt: task.createdAt }),
    eventIds: [createdEventId, assignedEventId],
  };
}

export async function handleUploadFile(
  deps: CommandHandlerDeps,
  request: UploadFileRequestDto,
  context: ApplicationContext,
): Promise<{ response: UploadFileResponseDto; eventIds: string[] }> {
  const file = await deps.ports.fileWrite.upload({
    tenantId: context.tenantId,
    fileName: request.fileName,
    mimeType: request.mimeType,
    sizeBytes: request.sizeBytes,
    entityType: request.entityType,
    entityId: request.entityId,
  });
  const eventId = await deps.infra.events.publishFileUploaded({
    fileId: file.id,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    entityType: request.entityType,
    entityId: request.entityId,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({ fileId: file.id, fileName: file.fileName, uploadedAt: file.uploadedAt }),
    eventIds: [eventId],
  };
}

export async function handleCompleteTask(
  deps: CommandHandlerDeps,
  request: CompleteTaskRequestDto,
  context: ApplicationContext,
): Promise<{ response: CompleteTaskResponseDto; eventIds: string[] }> {
  const task = await deps.ports.taskWrite.complete(context.tenantId, request.taskId, context.actorId);
  const eventId = await deps.infra.events.publishTaskCompleted({
    taskId: task.id,
    completedBy: context.actorId,
    completedAt: task.completedAt!,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({ taskId: task.id, completedAt: task.completedAt! }),
    eventIds: [eventId],
  };
}

export async function handleGenerateAISummary(
  deps: CommandHandlerDeps,
  request: GenerateAISummaryRequestDto,
  context: ApplicationContext,
): Promise<{ response: GenerateAISummaryResponseDto; eventIds: string[] }> {
  const summaryId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  const eventId = await deps.infra.events.publishAISummaryGenerated({
    summaryId,
    entityType: request.entityType,
    entityId: request.entityId,
    model: request.model ?? "mock-model",
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      summaryId,
      entityType: request.entityType,
      entityId: request.entityId,
      preview: `AI summary for ${request.entityType}:${request.entityId}`,
      generatedAt,
    }),
    eventIds: [eventId],
  };
}

export async function handleMarkNotificationRead(
  deps: CommandHandlerDeps,
  request: MarkNotificationReadRequestDto,
  context: ApplicationContext,
): Promise<{ response: MarkNotificationReadResponseDto; eventIds: string[] }> {
  await deps.ports.notificationWrite.markRead(context.tenantId, context.actorId, request.notificationId);
  const readAt = new Date().toISOString();
  return {
    response: Object.freeze({ notificationId: request.notificationId, readAt }),
    eventIds: [],
  };
}

export async function handleMarkAllNotificationsRead(
  deps: CommandHandlerDeps,
  _request: Record<string, never>,
  context: ApplicationContext,
): Promise<{ response: MarkAllNotificationsReadResponseDto; eventIds: string[] }> {
  await deps.ports.notificationWrite.markAllRead(context.tenantId, context.actorId);
  return {
    response: Object.freeze({ markedCount: 0, readAt: new Date().toISOString() }),
    eventIds: [],
  };
}

export async function handleArchiveNotification(
  deps: CommandHandlerDeps,
  request: ArchiveNotificationRequestDto,
  context: ApplicationContext,
): Promise<{ response: ArchiveNotificationResponseDto; eventIds: string[] }> {
  await deps.ports.notificationWrite.archive(context.tenantId, context.actorId, request.notificationId);
  return {
    response: Object.freeze({ notificationId: request.notificationId, archivedAt: new Date().toISOString() }),
    eventIds: [],
  };
}
