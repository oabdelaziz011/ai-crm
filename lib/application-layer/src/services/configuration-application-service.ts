import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";
import type { ConfigurationRecord, ConfigurationVersionRecord } from "../ports/configuration-ports.js";
import type {
  ConfigurationSaveDraftInput,
  ConfigurationPublishInput,
  ConfigurationRollbackInput,
} from "@workspace/configuration-platform";
import * as ConfigurationHandlers from "../handlers/configuration-handlers.js";

export type GetConfigurationQueryRequestDto = Readonly<{
  domain: string;
  scopeKey?: string;
  preferDraft?: boolean;
}>;

export type ListConfigurationVersionsQueryRequestDto = Readonly<{
  configurationId: string;
  limit?: number;
}>;

export class ConfigurationApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getConfiguration(
    request: GetConfigurationQueryRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<ConfigurationRecord | null>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "Configuration",
      request,
      context,
      requiredPermissions: ["configuration.read"],
      handler: (req, ctx) => ConfigurationHandlers.handleGetConfigurationQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  listVersions(
    request: ListConfigurationVersionsQueryRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<readonly ConfigurationVersionRecord[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ConfigurationVersions",
      request,
      context,
      requiredPermissions: ["configuration.read"],
      handler: (req, ctx) =>
        ConfigurationHandlers.handleListConfigurationVersionsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  saveDraft(
    request: Omit<ConfigurationSaveDraftInput, "tenantId" | "actorId">,
    context: ApplicationContext,
  ): Promise<CommandResult<ConfigurationRecord>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "SaveConfigurationDraft",
      request,
      context,
      requiredPermissions: ["configuration.write"],
      handler: async (req, ctx) => {
        const { response } = await ConfigurationHandlers.handleSaveConfigurationDraft(
          { ports: this.deps.ports, infra: this.deps.infra },
          { ...req, tenantId: ctx.tenantId, actorId: ctx.actorId },
          ctx,
        );
        return response;
      },
    });
  }

  publish(
    request: Omit<ConfigurationPublishInput, "tenantId" | "actorId">,
    context: ApplicationContext,
  ): Promise<CommandResult<ConfigurationRecord>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "PublishConfiguration",
      request,
      context,
      requiredPermissions: ["configuration.publish"],
      handler: async (req, ctx) => {
        const { response } = await ConfigurationHandlers.handlePublishConfiguration(
          { ports: this.deps.ports, infra: this.deps.infra },
          { ...req, tenantId: ctx.tenantId, actorId: ctx.actorId },
          ctx,
        );
        return response;
      },
    });
  }

  rollback(
    request: Omit<ConfigurationRollbackInput, "tenantId" | "actorId">,
    context: ApplicationContext,
  ): Promise<CommandResult<ConfigurationRecord>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "RollbackConfiguration",
      request,
      context,
      requiredPermissions: ["configuration.publish"],
      handler: async (req, ctx) => {
        const { response } = await ConfigurationHandlers.handleRollbackConfiguration(
          { ports: this.deps.ports, infra: this.deps.infra },
          { ...req, tenantId: ctx.tenantId, actorId: ctx.actorId },
          ctx,
        );
        return response;
      },
    });
  }
}
