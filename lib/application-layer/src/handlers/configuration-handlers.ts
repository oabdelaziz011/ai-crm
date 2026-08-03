import type {
  ConfigurationRecord,
  ConfigurationVersionRecord,
  ConfigurationSaveDraftInput,
  ConfigurationPublishInput,
  ConfigurationRollbackInput,
} from "../ports/configuration-ports.js";
import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { InfrastructurePorts } from "../ports/infrastructure-ports.js";
import type { ApplicationContext } from "../contracts/application-context.js";

export type ConfigurationCommandHandlerDeps = Readonly<{
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

export async function handleSaveConfigurationDraft(
  deps: ConfigurationCommandHandlerDeps,
  request: ConfigurationSaveDraftInput,
  context: ApplicationContext,
): Promise<{ response: ConfigurationRecord; eventIds: string[] }> {
  const record = await deps.ports.configurationWrite.saveDraft({
    ...request,
    tenantId: context.tenantId,
    actorId: context.actorId,
  });

  const cacheKey = deps.ports.configurationCache.buildKey(context.tenantId, request.domain, request.scopeKey);
  await deps.ports.configurationCache.invalidate(cacheKey);

  const eventId = await deps.infra.events.publishConfigurationUpdated({
    configurationId: record.id,
    domain: record.domain,
    scopeKey: record.scopeKey,
    version: record.version,
    status: "draft",
    context: eventContext(context),
  });

  return { response: record, eventIds: [eventId] };
}

export async function handlePublishConfiguration(
  deps: ConfigurationCommandHandlerDeps,
  request: ConfigurationPublishInput,
  context: ApplicationContext,
): Promise<{ response: ConfigurationRecord; eventIds: string[] }> {
  const record = await deps.ports.configurationWrite.publish({
    ...request,
    tenantId: context.tenantId,
    actorId: context.actorId,
  });

  const cacheKey = deps.ports.configurationCache.buildKey(context.tenantId, request.domain, request.scopeKey);
  await deps.ports.configurationCache.invalidate(cacheKey);

  const eventId = await deps.infra.events.publishConfigurationPublished({
    configurationId: record.id,
    domain: record.domain,
    scopeKey: record.scopeKey,
    version: record.version,
    context: eventContext(context),
  });

  return { response: record, eventIds: [eventId] };
}

export async function handleRollbackConfiguration(
  deps: ConfigurationCommandHandlerDeps,
  request: ConfigurationRollbackInput,
  context: ApplicationContext,
): Promise<{ response: ConfigurationRecord; eventIds: string[] }> {
  const record = await deps.ports.configurationWrite.rollback({
    ...request,
    tenantId: context.tenantId,
    actorId: context.actorId,
  });

  const cacheKey = deps.ports.configurationCache.buildKey(context.tenantId, record.domain, record.scopeKey);
  await deps.ports.configurationCache.invalidate(cacheKey);

  const eventId = await deps.infra.events.publishConfigurationUpdated({
    configurationId: record.id,
    domain: record.domain,
    scopeKey: record.scopeKey,
    version: record.version,
    status: "published",
    context: eventContext(context),
  });

  return { response: record, eventIds: [eventId] };
}

export type GetConfigurationQueryRequest = Readonly<{
  domain: string;
  scopeKey?: string;
  preferDraft?: boolean;
}>;

export async function handleGetConfigurationQuery(
  deps: { ports: ApplicationPorts },
  request: GetConfigurationQueryRequest,
  context: ApplicationContext,
): Promise<ConfigurationRecord | null> {
  const scopeKey = request.scopeKey ?? "default";
  const cacheKey = deps.ports.configurationCache.buildKey(context.tenantId, request.domain, scopeKey);

  const cached = await deps.ports.configurationCache.get<ConfigurationRecord>(cacheKey);
  if (cached) return cached;

  const record = request.preferDraft
    ? await deps.ports.configurationRead.get(context.tenantId, request.domain, scopeKey)
    : await deps.ports.configurationRead.getPublished(context.tenantId, request.domain, scopeKey);

  if (record) {
    await deps.ports.configurationCache.set(cacheKey, record);
  }

  return record;
}

export type ListConfigurationVersionsQueryRequest = Readonly<{
  configurationId: string;
  limit?: number;
}>;

export async function handleListConfigurationVersionsQuery(
  deps: { ports: ApplicationPorts },
  request: ListConfigurationVersionsQueryRequest,
  context: ApplicationContext,
): Promise<readonly ConfigurationVersionRecord[]> {
  return deps.ports.configurationRead.listVersions(context.tenantId, request.configurationId, request.limit);
}
