import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConfigurationReadPort,
  ConfigurationRecord,
  ConfigurationVersionRecord,
} from "@workspace/application-layer";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

type ConfigRow = {
  id: string;
  tenant_id: string;
  domain: string;
  scope_key: string;
  status: string;
  version: number;
  published_config: Record<string, unknown>;
  draft_config: Record<string, unknown> | null;
  published_at: string | null;
  published_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

type VersionRow = {
  id: string;
  configuration_id: string;
  tenant_id: string;
  version: number;
  config: Record<string, unknown>;
  action: string;
  change_summary: string | null;
  actor_id: string | null;
  created_at: string;
};

function mapConfigRow(row: ConfigRow): ConfigurationRecord {
  return Object.freeze({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    domain: String(row.domain),
    scopeKey: String(row.scope_key),
    status: row.status === "draft" ? "draft" : "published",
    version: Number(row.version),
    publishedConfig: Object.freeze({ ...(row.published_config ?? {}) }),
    draftConfig: row.draft_config ? Object.freeze({ ...row.draft_config }) : null,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    updatedAt: String(row.updated_at),
    updatedBy: row.updated_by,
  });
}

function mapVersionRow(row: VersionRow): ConfigurationVersionRecord {
  return Object.freeze({
    id: String(row.id),
    configurationId: String(row.configuration_id),
    tenantId: String(row.tenant_id),
    version: Number(row.version),
    config: Object.freeze({ ...(row.config ?? {}) }),
    action: row.action as ConfigurationVersionRecord["action"],
    changeSummary: row.change_summary,
    actorId: row.actor_id,
    createdAt: String(row.created_at),
  });
}

function canRead(ctx: LoginAppPortContext, domain: string): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.hasPermission("configuration.read")) return true;
  if (ctx.hasPermission("operations.universal.configure")) return true;
  if (ctx.hasPermission("operations.configuration.manage")) return true;
  if (domain.startsWith("operations") && ctx.hasPermission("configuration.operations.read")) return true;
  if (domain.startsWith("workspace") && ctx.hasPermission("configuration.workspace.read")) return true;
  if (domain === "crm" && ctx.hasPermission("configuration.crm.read")) return true;
  return ctx.hasPermission("operations.read");
}

function canReadVersions(ctx: LoginAppPortContext): boolean {
  return (
    canRead(ctx, "operations.workspace")
    || canRead(ctx, "workspace")
    || canRead(ctx, "crm")
  );
}

export function createLoginAppConfigurationReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): ConfigurationReadPort {
  return {
    async get(tenantId, domain, scopeKey = "default") {
      if (tenantId !== ctx.companyId || !canRead(ctx, domain)) return null;

      const { data, error } = await client
        .from("platform_configurations")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("domain", domain)
        .eq("scope_key", scopeKey)
        .maybeSingle();

      if (error || !data) return null;
      return mapConfigRow(data as ConfigRow);
    },

    async getPublished(tenantId, domain, scopeKey = "default") {
      const record = await this.get(tenantId, domain, scopeKey);
      if (!record) return null;
      return Object.freeze({ ...record, draftConfig: null, status: "published" as const });
    },

    async listVersions(tenantId, configurationId, limit = 25) {
      if (tenantId !== ctx.companyId || !canReadVersions(ctx)) return [];

      const { data, error } = await client
        .from("platform_configuration_versions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("configuration_id", configurationId)
        .order("version", { ascending: false })
        .limit(limit);

      if (error) return [];
      return Object.freeze((data ?? []).map((row) => mapVersionRow(row as VersionRow)));
    },

    async getVersion(tenantId, configurationId, version) {
      if (tenantId !== ctx.companyId || !canReadVersions(ctx)) return null;

      const { data, error } = await client
        .from("platform_configuration_versions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("configuration_id", configurationId)
        .eq("version", version)
        .maybeSingle();

      if (error || !data) return null;
      return mapVersionRow(data as VersionRow);
    },
  };
}
