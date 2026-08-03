import type { OperationsWorkspaceReadPort, OperationsWorkspaceConfigModel, ConfigurationReadPort } from "@workspace/application-layer";
import { getMockWorkspaceConfig } from "@workspace/universal-operations-engine";
import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

const OPERATIONS_WORKSPACE_DOMAIN = "operations.workspace";

function toConfigModel(
  tenantId: string,
  templateKey: string,
  config: OperationsWorkspaceConfig,
  rowId?: string,
): OperationsWorkspaceConfigModel {
  return Object.freeze({
    id: rowId ?? config.id,
    companyId: tenantId,
    templateKey,
    config: config as unknown as Record<string, unknown>,
    updatedAt: config.updatedAt,
  });
}

/** Reads operations workspace config through the unified Configuration Platform. */
export function createLoginAppOperationsWorkspaceReadPort(
  configurationRead: ConfigurationReadPort,
  ctx: LoginAppPortContext,
): OperationsWorkspaceReadPort {
  return {
    async getConfig(tenantId, templateKey): Promise<OperationsWorkspaceConfigModel | null> {
      if (tenantId !== ctx.companyId || !(ctx.isSuperAdmin || ctx.hasPermission("operations.read"))) {
        return null;
      }

      const record = await configurationRead.getPublished(tenantId, OPERATIONS_WORKSPACE_DOMAIN, templateKey);
      if (record?.publishedConfig && Object.keys(record.publishedConfig).length > 0) {
        const stored = record.publishedConfig as OperationsWorkspaceConfig;
        return toConfigModel(tenantId, templateKey, {
          ...stored,
          companyId: tenantId,
          templateKey,
          updatedAt: record.updatedAt,
        }, record.id);
      }

      const seed = getMockWorkspaceConfig(templateKey);
      return toConfigModel(tenantId, templateKey, {
        ...seed,
        id: `cfg_${templateKey}`,
        companyId: tenantId,
        templateKey,
        updatedAt: new Date().toISOString(),
      });
    },
  };
}
