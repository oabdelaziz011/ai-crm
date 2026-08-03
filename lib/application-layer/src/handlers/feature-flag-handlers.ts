import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { InfrastructurePorts } from "../ports/infrastructure-ports.js";
import type { ApplicationContext } from "../contracts/application-context.js";
import type { FeatureFlagResolutionContext, FeatureFlagUpsertInput } from "../ports/feature-flag-ports.js";

export type FeatureFlagCommandHandlerDeps = Readonly<{
  ports: ApplicationPorts;
  infra: InfrastructurePorts;
}>;

function resolutionContext(context: ApplicationContext): FeatureFlagResolutionContext {
  return {
    companyId: context.tenantId,
    userId: context.actorId,
    rolloutSubjectId: context.actorId,
    environment: "production",
  };
}

async function enrichResolutionContext(
  deps: { ports: ApplicationPorts },
  context: ApplicationContext,
  base: FeatureFlagResolutionContext,
): Promise<FeatureFlagResolutionContext> {
  const license = await deps.ports.licenseRead.getCompanyLicense(context.tenantId);
  return {
    ...base,
    planId: license?.planCode ?? null,
    companyId: context.tenantId,
  };
}

export async function handleUpsertFeatureFlag(
  deps: FeatureFlagCommandHandlerDeps,
  request: FeatureFlagUpsertInput,
  context: ApplicationContext,
) {
  const record = await deps.ports.featureFlagWrite.upsert({
    ...request,
    tenantId: context.tenantId,
    actorId: context.actorId,
  });

  await deps.ports.configurationCache.invalidate(
    deps.ports.configurationCache.buildKey(context.tenantId, "feature_flags", request.featureKey),
  );

  const eventId = await deps.infra.events.publishFeatureFlagUpdated({
    featureKey: request.featureKey,
    scopeType: request.scopeType,
    scopeId: request.scopeId,
    enabled: request.enabled,
    context: {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      actorType: context.actorType,
      correlationId: context.correlationId,
    },
  });

  return { response: record, eventIds: [eventId] };
}

export type ResolveFeatureFlagQueryRequest = Readonly<{
  featureKey: string;
  context?: FeatureFlagResolutionContext;
}>;

export async function handleResolveFeatureFlagQuery(
  deps: { ports: ApplicationPorts },
  request: ResolveFeatureFlagQueryRequest,
  context: ApplicationContext,
) {
  const license = await deps.ports.licenseRead.canAccess(context.tenantId, request.featureKey);
  if (!license.allowed) {
    return Object.freeze({
      featureKey: request.featureKey,
      enabled: false,
      source: "default" as const,
      licenseBlocked: true,
      licenseReason: license.reason,
    });
  }

  const flag = await deps.ports.featureFlagRead.resolve(
    context.tenantId,
    request.featureKey,
    await enrichResolutionContext(deps, context, { ...resolutionContext(context), ...request.context }),
  );

  return Object.freeze({ ...flag, licenseBlocked: false });
}

export type ResolveFeatureFlagsQueryRequest = Readonly<{
  featureKeys: readonly string[];
}>;

export async function handleResolveFeatureFlagsQuery(
  deps: { ports: ApplicationPorts },
  request: ResolveFeatureFlagsQueryRequest,
  context: ApplicationContext,
) {
  const ctx = await enrichResolutionContext(deps, context, resolutionContext(context));
  const flags = await deps.ports.featureFlagRead.resolveMany(context.tenantId, request.featureKeys, ctx);

  const gated: Record<string, boolean> = {};
  for (const key of request.featureKeys) {
    const license = await deps.ports.licenseRead.canAccess(context.tenantId, key);
    gated[key] = license.allowed && flags[key] === true;
  }

  return Object.freeze(gated);
}

export type CanAccessFeatureQueryRequest = Readonly<{
  featureKey: string;
}>;

export async function handleCanAccessFeatureQuery(
  deps: { ports: ApplicationPorts },
  request: CanAccessFeatureQueryRequest,
  context: ApplicationContext,
) {
  return deps.ports.licenseRead.canAccess(context.tenantId, request.featureKey);
}
