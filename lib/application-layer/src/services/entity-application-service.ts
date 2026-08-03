import type { ApplicationContext, CommandResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline } from "../pipeline/command-query-pipeline.js";
import type {
  EntityContactCreateInput,
  EntityContactUpdateInput,
  EntityActivityCreateInput,
  EntityFileCreateInput,
  EntityCustomFieldValueUpsertInput,
  EntityContactReadModel,
  EntityActivityReadModel,
  EntityFileReadModel,
  EntityCustomFieldValueReadModel,
} from "../entity/entity-models.js";
import * as EntityCommandHandlers from "../handlers/commands/entity-command-handlers.js";

export type CreateEntityContactRequestDto = Readonly<
  Omit<EntityContactCreateInput, "tenantId" | "actorUserId">
>;

export type CreateEntityContactResponseDto = Readonly<{
  contact: EntityContactReadModel;
}>;

export type CreateEntityActivityRequestDto = Readonly<
  Omit<EntityActivityCreateInput, "tenantId" | "actorUserId">
>;

export type CreateEntityActivityResponseDto = Readonly<{
  activity: EntityActivityReadModel;
}>;

export type CreateEntityFileRequestDto = Readonly<
  Omit<EntityFileCreateInput, "tenantId" | "actorUserId">
>;

export type CreateEntityFileResponseDto = Readonly<{
  file: EntityFileReadModel;
}>;

export type AssignEntityTagRequestDto = Readonly<{
  entityType: string;
  entityId: string;
  tagId: string;
}>;

export type AssignEntityTagResponseDto = Readonly<{
  assigned: true;
}>;

export type UpsertEntityCustomFieldValueRequestDto = Readonly<
  Omit<EntityCustomFieldValueUpsertInput, "tenantId" | "actorUserId">
>;

export type UpsertEntityCustomFieldValueResponseDto = Readonly<{
  value: EntityCustomFieldValueReadModel;
}>;

export class EntityApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  createContact(
    request: CreateEntityContactRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<CreateEntityContactResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "CreateEntityContact",
      request,
      context,
      requiredPermissions: ["entity.contacts.write"],
      handler: async (req, ctx) => {
        const { response } = await EntityCommandHandlers.handleCreateEntityContact(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  updateContact(
    contactId: string,
    patch: EntityContactUpdateInput,
    context: ApplicationContext,
  ): Promise<CommandResult<CreateEntityContactResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "UpdateEntityContact",
      request: { contactId, patch },
      context,
      requiredPermissions: ["entity.contacts.write"],
      handler: async (req, ctx) => {
        const { response } = await EntityCommandHandlers.handleUpdateEntityContact(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  createActivity(
    request: CreateEntityActivityRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<CreateEntityActivityResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "CreateEntityActivity",
      request,
      context,
      requiredPermissions: ["entity.activities.write"],
      handler: async (req, ctx) => {
        const { response } = await EntityCommandHandlers.handleCreateEntityActivity(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  assignTag(
    request: AssignEntityTagRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<AssignEntityTagResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "AssignEntityTag",
      request,
      context,
      requiredPermissions: ["entity.tags.write"],
      handler: async (req, ctx) => {
        const { response } = await EntityCommandHandlers.handleAssignEntityTag(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  createFile(
    request: CreateEntityFileRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<CreateEntityFileResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "CreateEntityFile",
      request,
      context,
      requiredPermissions: ["entity.files.write"],
      handler: async (req, ctx) => {
        const { response } = await EntityCommandHandlers.handleCreateEntityFile(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  upsertCustomFieldValue(
    request: UpsertEntityCustomFieldValueRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<UpsertEntityCustomFieldValueResponseDto>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "UpsertEntityCustomFieldValue",
      request,
      context,
      requiredPermissions: ["entity.custom_fields.write"],
      handler: async (req, ctx) => {
        const { response } = await EntityCommandHandlers.handleUpsertEntityCustomFieldValue(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }
}
