import type { ApplicationPorts } from "../../ports/repository-ports.js";
import type { InfrastructurePorts } from "../../ports/infrastructure-ports.js";
import type { ApplicationContext } from "../../contracts/application-context.js";
import type { ConvertLeadRequestDto, ConvertLeadResponseDto } from "../../dto/command-dtos.js";
import type {
  CreateLeadRequestDto,
  UpdateLeadRequestDto,
  AssignLeadRequestDto,
  ChangeLeadStageRequestDto,
  BulkChangeLeadStageRequestDto,
  ArchiveLeadRequestDto,
} from "../../services/lead-application-service.js";

export type LeadCommandHandlerDeps = Readonly<{
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

export async function handleCreateLead(
  deps: LeadCommandHandlerDeps,
  request: CreateLeadRequestDto,
  context: ApplicationContext,
) {
  const lead = await deps.ports.leadWrite.create({
    tenantId: context.tenantId,
    actorUserId: context.actorId,
    ...request,
  });
  const eventId = await deps.infra.events.publishLeadCreated({
    leadId: lead.id,
    title: lead.name ?? request.name,
    source: request.sourceId,
    context: eventContext(context),
  });
  return { response: lead, eventIds: [eventId] };
}

export async function handleUpdateLead(
  deps: LeadCommandHandlerDeps,
  request: UpdateLeadRequestDto,
  context: ApplicationContext,
) {
  const lead = await deps.ports.leadWrite.update(context.tenantId, request.leadId, {
    ...request.patch,
    actorUserId: context.actorId,
  });
  const eventId = await deps.infra.events.publishLeadUpdated({
    leadId: request.leadId,
    changedFields: Object.keys(request.patch),
    patch: request.patch as Record<string, unknown>,
    context: eventContext(context),
  });
  return { response: lead, eventIds: [eventId] };
}

export async function handleAssignLead(
  deps: LeadCommandHandlerDeps,
  request: AssignLeadRequestDto,
  context: ApplicationContext,
) {
  const lead = await deps.ports.leadWrite.assign(
    context.tenantId,
    request.leadId,
    request.assigneeUserId,
    context.actorId,
  );
  return { response: lead, eventIds: [] as string[] };
}

export async function handleChangeLeadStage(
  deps: LeadCommandHandlerDeps,
  request: ChangeLeadStageRequestDto,
  context: ApplicationContext,
) {
  const lead = await deps.ports.leadWrite.changeStage(
    context.tenantId,
    request.leadId,
    request.stageId,
    context.actorId,
  );
  return { response: lead, eventIds: [] as string[] };
}

export async function handleBulkChangeLeadStage(
  deps: LeadCommandHandlerDeps,
  request: BulkChangeLeadStageRequestDto,
  context: ApplicationContext,
) {
  await deps.ports.leadWrite.bulkChangeStage(
    context.tenantId,
    request.leadIds,
    request.stageId,
    context.actorId,
  );
  return { response: Object.freeze({ updated: request.leadIds.length }), eventIds: [] as string[] };
}

export async function handleConvertLead(
  deps: LeadCommandHandlerDeps,
  request: ConvertLeadRequestDto,
  context: ApplicationContext,
): Promise<{ response: ConvertLeadResponseDto; eventIds: string[] }> {
  const result = await deps.ports.leadWrite.convert(context.tenantId, request.leadId, context.actorId);
  const eventId = await deps.infra.events.publishLeadConverted({
    leadId: request.leadId,
    customerId: result.customerId,
    context: eventContext(context),
  });
  return {
    response: Object.freeze({
      leadId: request.leadId,
      customerId: result.customerId,
      convertedAt: new Date().toISOString(),
    }),
    eventIds: [eventId],
  };
}

export async function handleArchiveLead(
  deps: LeadCommandHandlerDeps,
  request: ArchiveLeadRequestDto,
  context: ApplicationContext,
) {
  await deps.ports.leadWrite.archive(context.tenantId, request.leadId, context.actorId);
  return { response: Object.freeze({ archived: true as const }), eventIds: [] as string[] };
}
