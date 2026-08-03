import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";
import type { FeatureFlagRecord, FeatureFlagUpsertInput } from "../ports/feature-flag-ports.js";
import type { LicenseAccessResult } from "../ports/license-ports.js";
import * as FeatureFlagHandlers from "../handlers/feature-flag-handlers.js";

export type ResolveFeatureFlagQueryRequestDto = Readonly<{
  featureKey: string;
}>;

export type ResolveFeatureFlagsQueryRequestDto = Readonly<{
  featureKeys: readonly string[];
}>;

export type CanAccessFeatureQueryRequestDto = Readonly<{
  featureKey: string;
}>;

export type FeatureFlagResolutionDto = Readonly<{
  featureKey: string;
  enabled: boolean;
  source: string;
  licenseBlocked?: boolean;
  licenseReason?: string;
}>;

export class FeatureFlagApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  isEnabled(
    request: ResolveFeatureFlagQueryRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<FeatureFlagResolutionDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ResolveFeatureFlag",
      request,
      context,
      requiredPermissions: ["feature_flags.read"],
      handler: (req, ctx) => FeatureFlagHandlers.handleResolveFeatureFlagQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  resolveMany(
    request: ResolveFeatureFlagsQueryRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<Readonly<Record<string, boolean>>>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "ResolveFeatureFlags",
      request,
      context,
      requiredPermissions: ["feature_flags.read"],
      handler: (req, ctx) => FeatureFlagHandlers.handleResolveFeatureFlagsQuery({ ports: this.deps.ports }, req, ctx),
    });
  }

  upsert(
    request: Omit<FeatureFlagUpsertInput, "tenantId" | "actorId">,
    context: ApplicationContext,
  ): Promise<CommandResult<FeatureFlagRecord>> {
    const pipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return pipeline.execute({
      commandType: "UpsertFeatureFlag",
      request,
      context,
      requiredPermissions: ["feature_flags.write"],
      handler: async (req, ctx) => {
        const { response } = await FeatureFlagHandlers.handleUpsertFeatureFlag(
          { ports: this.deps.ports, infra: this.deps.infra },
          { ...req, tenantId: ctx.tenantId, actorId: ctx.actorId },
          ctx,
        );
        return response;
      },
    });
  }
}

export class LicensingApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  canAccess(
    request: CanAccessFeatureQueryRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<LicenseAccessResult>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "CanAccessFeature",
      request,
      context,
      requiredPermissions: ["licenses.read"],
      handler: (req, ctx) => FeatureFlagHandlers.handleCanAccessFeatureQuery({ ports: this.deps.ports }, req, ctx),
    });
  }
}
