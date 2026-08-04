import {
  buildDefaultOperationsWorkspaceConfig,
  deepMergeOperationsConfig,
  diffOperationsConfig,
  parseOperationsWorkspaceConfig,
  resetOperationsConfigSection,
  validateOperationsWorkspaceConfig,
  type OperationsConfigDiffEntry,
  type OperationsConfigValidationReport,
  type OperationsWorkspaceConfig,
} from "@workspace/universal-operations-engine";
import type { ConfigurationRecord } from "@workspace/application-layer";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "./application-layer-bootstrap";

export const OPERATIONS_WORKSPACE_DOMAIN = "operations.workspace";

export type OperationsConfigCommandContext = {
  registry: ReturnType<typeof createLoginAppApplicationLayerRegistry>;
  context: ReturnType<typeof buildApplicationContext>;
  companyId: string;
};

export function createOperationsConfigCommandContext(input: {
  companyId: string;
  actorUserId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
}): OperationsConfigCommandContext {
  const portContext = {
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    isSuperAdmin: input.isSuperAdmin,
    hasPermission: input.hasPermission,
  };
  return {
    registry: createLoginAppApplicationLayerRegistry(portContext),
    context: buildApplicationContext({
      tenantId: input.companyId,
      actorId: input.actorUserId,
      permissions: permissionCodes(input.hasPermission, input.isSuperAdmin),
    }),
    companyId: input.companyId,
  };
}

export function resolveOperationsConfigFromRecord(
  record: ConfigurationRecord | null,
  preferDraft: boolean,
): OperationsWorkspaceConfig | null {
  if (!record) return null;
  const raw =
    preferDraft && record.draftConfig && Object.keys(record.draftConfig).length > 0
      ? record.draftConfig
      : record.publishedConfig;
  if (!raw || Object.keys(raw).length === 0) return null;
  return parseOperationsWorkspaceConfig(
    raw as Record<string, unknown>,
    record.scopeKey ?? String((raw as Record<string, unknown>).templateKey ?? "clinic"),
    record.tenantId,
  );
}

export async function loadOperationsConfigurationRecord(
  cmd: OperationsConfigCommandContext,
  templateKey: string,
  preferDraft: boolean,
): Promise<ConfigurationRecord | null> {
  const result = await cmd.registry.getServices().configuration.getConfiguration(
    { domain: OPERATIONS_WORKSPACE_DOMAIN, scopeKey: templateKey, preferDraft },
    cmd.context,
  );
  return result.data;
}

export async function ensureOperationsWorkspaceSeed(
  cmd: OperationsConfigCommandContext,
  templateKey: string,
): Promise<ConfigurationRecord> {
  const existing = await loadOperationsConfigurationRecord(cmd, templateKey, false);
  if (existing?.publishedConfig && Object.keys(existing.publishedConfig).length > 0) {
    return existing;
  }

  const defaultConfig = buildDefaultOperationsWorkspaceConfig(templateKey, cmd.companyId);
  await cmd.registry.getServices().configuration.saveDraft(
    {
      domain: OPERATIONS_WORKSPACE_DOMAIN,
      scopeKey: templateKey,
      config: defaultConfig as unknown as Record<string, unknown>,
    },
    cmd.context,
  );
  const published = await cmd.registry.getServices().configuration.publish(
    {
      domain: OPERATIONS_WORKSPACE_DOMAIN,
      scopeKey: templateKey,
      changeSummary: "Initial tenant operations workspace seed",
    },
    cmd.context,
  );
  return published.data;
}

export function validateOperationsConfiguration(
  config: OperationsWorkspaceConfig,
): OperationsConfigValidationReport {
  return validateOperationsWorkspaceConfig(config);
}

export async function saveOperationsConfigurationDraft(
  cmd: OperationsConfigCommandContext,
  templateKey: string,
  config: OperationsWorkspaceConfig,
): Promise<ConfigurationRecord> {
  const result = await cmd.registry.getServices().configuration.saveDraft(
    {
      domain: OPERATIONS_WORKSPACE_DOMAIN,
      scopeKey: templateKey,
      config: { ...config, updatedAt: new Date().toISOString() } as unknown as Record<string, unknown>,
    },
    cmd.context,
  );
  return result.data;
}

export async function publishOperationsConfiguration(
  cmd: OperationsConfigCommandContext,
  templateKey: string,
  changeSummary?: string,
): Promise<ConfigurationRecord> {
  const result = await cmd.registry.getServices().configuration.publish(
    { domain: OPERATIONS_WORKSPACE_DOMAIN, scopeKey: templateKey, changeSummary },
    cmd.context,
  );
  return result.data;
}

export async function rollbackOperationsConfiguration(
  cmd: OperationsConfigCommandContext,
  configurationId: string,
  targetVersion: number,
): Promise<ConfigurationRecord> {
  const result = await cmd.registry.getServices().configuration.rollback(
    { configurationId, targetVersion },
    cmd.context,
  );
  return result.data;
}

export async function listOperationsConfigurationVersions(
  cmd: OperationsConfigCommandContext,
  configurationId: string,
  limit?: number,
) {
  const result = await cmd.registry.getServices().configuration.listVersions(
    { configurationId, limit },
    cmd.context,
  );
  return result.data;
}

/** Discard unpublished draft by restoring draft blob to published snapshot. */
export async function discardOperationsConfigurationDraft(
  cmd: OperationsConfigCommandContext,
  templateKey: string,
): Promise<ConfigurationRecord> {
  const record = await loadOperationsConfigurationRecord(cmd, templateKey, false);
  if (!record?.publishedConfig || Object.keys(record.publishedConfig).length === 0) {
    throw new Error("No published configuration to restore");
  }
  const published = parseOperationsWorkspaceConfig(
    record.publishedConfig as Record<string, unknown>,
    templateKey,
    cmd.companyId,
  );
  return saveOperationsConfigurationDraft(cmd, templateKey, published);
}

export function exportOperationsConfiguration(config: OperationsWorkspaceConfig): string {
  return JSON.stringify(config, null, 2);
}

export function importOperationsConfigurationJson(
  json: string,
  templateKey: string,
  companyId: string,
): OperationsWorkspaceConfig {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const merged = parseOperationsWorkspaceConfig(parsed, templateKey, companyId);
  const report = validateOperationsWorkspaceConfig(merged);
  if (!report.valid) {
    throw new Error(`Import validation failed: ${report.issues.map((i) => i.message).join("; ")}`);
  }
  return merged;
}

export async function cloneOperationsConfiguration(
  cmd: OperationsConfigCommandContext,
  sourceTemplateKey: string,
  targetTemplateKey: string,
  config: OperationsWorkspaceConfig,
): Promise<ConfigurationRecord> {
  await ensureOperationsWorkspaceSeed(cmd, targetTemplateKey);
  const clone: OperationsWorkspaceConfig = {
    ...structuredClone(config),
    id: `cfg_${targetTemplateKey}`,
    templateKey: targetTemplateKey,
    companyId: cmd.companyId,
    updatedAt: new Date().toISOString(),
  };
  await saveOperationsConfigurationDraft(cmd, targetTemplateKey, clone);
  return publishOperationsConfiguration(cmd, targetTemplateKey, `Cloned from ${sourceTemplateKey}`);
}

export function compareOperationsConfigurations(
  before: OperationsWorkspaceConfig,
  after: OperationsWorkspaceConfig,
) {
  return diffOperationsConfig(before, after);
}

export function resetOperationsConfigurationSection(
  config: OperationsWorkspaceConfig,
  section: keyof OperationsWorkspaceConfig,
): OperationsWorkspaceConfig {
  return resetOperationsConfigSection(config, section);
}

export function mergeOperationsConfigurationImport(
  current: OperationsWorkspaceConfig,
  imported: Partial<OperationsWorkspaceConfig>,
): OperationsWorkspaceConfig {
  return deepMergeOperationsConfig(current, imported);
}
