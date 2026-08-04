import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfigurationWritePort, ConfigurationRecord } from "@workspace/application-layer";
import {
  assertConfigurationDomain,
  CONFIGURATION_DOMAINS,
  createDefaultConfigurationMetadataEngine,
} from "@workspace/configuration-platform";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

const metadataEngine = createDefaultConfigurationMetadataEngine();

function canWrite(ctx: LoginAppPortContext, domain: string): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.hasPermission("configuration.write")) return true;
  if (domain.startsWith("operations") && ctx.hasPermission("configuration.operations.write")) return true;
  if (domain.startsWith("workspace") && ctx.hasPermission("configuration.workspace.write")) return true;
  if (domain === "crm" && ctx.hasPermission("configuration.crm.write")) return true;
  return ctx.hasPermission("operations.universal.configure");
}

function canPublish(ctx: LoginAppPortContext): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.hasPermission("configuration.publish")) return true;
  if (ctx.hasPermission("operations.universal.configure")) return true;
  return ctx.hasPermission("operations.configuration.manage");
}

async function insertVersion(
  client: SupabaseClient,
  input: {
    configurationId: string;
    tenantId: string;
    version: number;
    config: Record<string, unknown>;
    action: string;
    changeSummary?: string;
    actorId: string;
  },
): Promise<void> {
  await client.from("platform_configuration_versions").insert({
    configuration_id: input.configurationId,
    tenant_id: input.tenantId,
    version: input.version,
    config: input.config,
    action: input.action,
    change_summary: input.changeSummary ?? null,
    actor_id: input.actorId,
  });
}

function mapRow(row: Record<string, unknown>): ConfigurationRecord {
  return Object.freeze({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    domain: String(row.domain),
    scopeKey: String(row.scope_key),
    status: row.status === "draft" ? "draft" : "published",
    version: Number(row.version),
    publishedConfig: Object.freeze({ ...((row.published_config as Record<string, unknown>) ?? {}) }),
    draftConfig: row.draft_config
      ? Object.freeze({ ...((row.draft_config as Record<string, unknown>) ?? {}) })
      : null,
    publishedAt: (row.published_at as string | null) ?? null,
    publishedBy: (row.published_by as string | null) ?? null,
    updatedAt: String(row.updated_at),
    updatedBy: (row.updated_by as string | null) ?? null,
  });
}

export function createLoginAppConfigurationWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): ConfigurationWritePort {
  return {
    async saveDraft(input) {
      if (input.tenantId !== ctx.companyId || !canWrite(ctx, input.domain)) {
        throw new Error("Permission denied");
      }
      assertConfigurationDomain(input.domain, CONFIGURATION_DOMAINS);
      const normalized = metadataEngine.normalize(input.domain, input.config);
      const now = new Date().toISOString();

      const { data: existing } = await client
        .from("platform_configurations")
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("domain", input.domain)
        .eq("scope_key", input.scopeKey)
        .maybeSingle();

      if (existing) {
        const { data, error } = await client
          .from("platform_configurations")
          .update({
            draft_config: normalized,
            status: "draft",
            updated_at: now,
            updated_by: input.actorId,
          })
          .eq("id", existing.id)
          .select("*")
          .single();

        if (error) throw new Error(error.message);
        await insertVersion(client, {
          configurationId: String(data.id),
          tenantId: input.tenantId,
          version: Number(data.version),
          config: normalized,
          action: "draft",
          changeSummary: input.changeSummary,
          actorId: input.actorId,
        });
        return mapRow(data);
      }

      const { data, error } = await client
        .from("platform_configurations")
        .insert({
          tenant_id: input.tenantId,
          domain: input.domain,
          scope_key: input.scopeKey,
          status: "draft",
          version: 1,
          published_config: {},
          draft_config: normalized,
          updated_at: now,
          updated_by: input.actorId,
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      await insertVersion(client, {
        configurationId: String(data.id),
        tenantId: input.tenantId,
        version: 1,
        config: normalized,
        action: "draft",
        changeSummary: input.changeSummary,
        actorId: input.actorId,
      });
      return mapRow(data);
    },

    async publish(input) {
      if (input.tenantId !== ctx.companyId || !canPublish(ctx)) {
        throw new Error("Permission denied");
      }
      assertConfigurationDomain(input.domain, CONFIGURATION_DOMAINS);

      const { data: existing, error: fetchError } = await client
        .from("platform_configurations")
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("domain", input.domain)
        .eq("scope_key", input.scopeKey)
        .single();

      if (fetchError || !existing) throw new Error("Configuration not found");

      const config = (existing.draft_config ?? existing.published_config) as Record<string, unknown>;
      const normalized = metadataEngine.normalize(input.domain, config);
      const now = new Date().toISOString();
      const nextVersion = Number(existing.version) + 1;

      const { data, error } = await client
        .from("platform_configurations")
        .update({
          published_config: normalized,
          draft_config: null,
          status: "published",
          version: nextVersion,
          published_at: now,
          published_by: input.actorId,
          updated_at: now,
          updated_by: input.actorId,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      await insertVersion(client, {
        configurationId: String(data.id),
        tenantId: input.tenantId,
        version: nextVersion,
        config: normalized,
        action: "publish",
        changeSummary: input.changeSummary,
        actorId: input.actorId,
      });
      return mapRow(data);
    },

    async rollback(input) {
      if (input.tenantId !== ctx.companyId || !canPublish(ctx)) {
        throw new Error("Permission denied");
      }

      const { data: versionRow, error: versionError } = await client
        .from("platform_configuration_versions")
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("configuration_id", input.configurationId)
        .eq("version", input.targetVersion)
        .single();

      if (versionError || !versionRow) throw new Error("Version not found");

      const now = new Date().toISOString();
      const config = versionRow.config as Record<string, unknown>;

      const { data, error } = await client
        .from("platform_configurations")
        .update({
          published_config: config,
          draft_config: null,
          status: "published",
          version: input.targetVersion,
          published_at: now,
          published_by: input.actorId,
          updated_at: now,
          updated_by: input.actorId,
        })
        .eq("id", input.configurationId)
        .eq("tenant_id", input.tenantId)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      await insertVersion(client, {
        configurationId: input.configurationId,
        tenantId: input.tenantId,
        version: input.targetVersion,
        config,
        action: "rollback",
        changeSummary: `Rollback to version ${input.targetVersion}`,
        actorId: input.actorId,
      });
      return mapRow(data);
    },
  };
}
