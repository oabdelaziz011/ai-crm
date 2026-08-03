import type { ApplicationPorts } from "../../ports/repository-ports.js";
import type { InfrastructurePorts } from "../../ports/infrastructure-ports.js";
import type { ApplicationContext } from "../../contracts/application-context.js";
import type {
  CreateEntityContactRequestDto,
  CreateEntityContactResponseDto,
  CreateEntityActivityRequestDto,
  CreateEntityActivityResponseDto,
  CreateEntityFileRequestDto,
  CreateEntityFileResponseDto,
  AssignEntityTagRequestDto,
  AssignEntityTagResponseDto,
  UpsertEntityCustomFieldValueRequestDto,
  UpsertEntityCustomFieldValueResponseDto,
} from "../../services/entity-application-service.js";
import type { EntityContactUpdateInput } from "../../entity/entity-models.js";

export type EntityCommandHandlerDeps = Readonly<{
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

export async function handleCreateEntityContact(
  deps: EntityCommandHandlerDeps,
  request: CreateEntityContactRequestDto,
  context: ApplicationContext,
): Promise<{ response: CreateEntityContactResponseDto; eventIds: string[] }> {
  const contact = await deps.ports.entityContactWrite.create({
    tenantId: context.tenantId,
    actorUserId: context.actorId,
    ...request,
  });

  return {
    response: Object.freeze({ contact }),
    eventIds: [],
  };
}

export async function handleUpdateEntityContact(
  deps: EntityCommandHandlerDeps,
  request: { contactId: string; patch: EntityContactUpdateInput },
  context: ApplicationContext,
): Promise<{ response: CreateEntityContactResponseDto; eventIds: string[] }> {
  const contact = await deps.ports.entityContactWrite.update(context.tenantId, request.contactId, {
    ...request.patch,
    actorUserId: context.actorId,
  });

  return {
    response: Object.freeze({ contact }),
    eventIds: [],
  };
}

export async function handleCreateEntityActivity(
  deps: EntityCommandHandlerDeps,
  request: CreateEntityActivityRequestDto,
  context: ApplicationContext,
): Promise<{ response: CreateEntityActivityResponseDto; eventIds: string[] }> {
  const activity = await deps.ports.entityActivityWrite.create({
    tenantId: context.tenantId,
    actorUserId: context.actorId,
    ...request,
  });

  return {
    response: Object.freeze({ activity }),
    eventIds: [],
  };
}

export async function handleAssignEntityTag(
  deps: EntityCommandHandlerDeps,
  request: AssignEntityTagRequestDto,
  context: ApplicationContext,
): Promise<{ response: AssignEntityTagResponseDto; eventIds: string[] }> {
  await deps.ports.entityTagWrite.assign(
    context.tenantId,
    request.entityType,
    request.entityId,
    request.tagId,
    context.actorId,
  );

  return {
    response: Object.freeze({ assigned: true }),
    eventIds: [],
  };
}

export async function handleCreateEntityFile(
  deps: EntityCommandHandlerDeps,
  request: CreateEntityFileRequestDto,
  context: ApplicationContext,
): Promise<{ response: CreateEntityFileResponseDto; eventIds: string[] }> {
  const file = await deps.ports.entityFileWrite.create({
    tenantId: context.tenantId,
    actorUserId: context.actorId,
    ...request,
  });

  const eventId = await deps.infra.events.publishFileUploaded({
    fileId: file.id,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    entityType: file.entityType,
    entityId: file.entityId,
    context: eventContext(context),
  });

  return {
    response: Object.freeze({ file }),
    eventIds: [eventId],
  };
}

export async function handleUpsertEntityCustomFieldValue(
  deps: EntityCommandHandlerDeps,
  request: UpsertEntityCustomFieldValueRequestDto,
  context: ApplicationContext,
): Promise<{ response: UpsertEntityCustomFieldValueResponseDto; eventIds: string[] }> {
  const value = await deps.ports.entityCustomFieldWrite.upsertValue({
    tenantId: context.tenantId,
    actorUserId: context.actorId,
    ...request,
  });

  return {
    response: Object.freeze({ value }),
    eventIds: [],
  };
}
