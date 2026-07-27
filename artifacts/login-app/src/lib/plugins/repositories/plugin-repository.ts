import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MarketplaceOverview,
  PluginAuditEntry,
  PluginCatalogEntry,
  PluginHealthRecord,
  PluginInstallation,
  PluginManifest,
  PluginPermission,
} from "@/lib/plugins/types";
import { catalogEntryFromRow } from "@/lib/plugins/registry/plugin-registry";
import { parseManifest } from "@/lib/plugins/manifest/manifest-validator";

function mapInstallation(row: Record<string, unknown>, pluginId: string, pluginName: string, version: string): PluginInstallation {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    registryId: String(row.registry_id),
    pluginId,
    pluginName,
    version,
    status: row.status as PluginInstallation["status"],
    grantedPermissions: (row.granted_permissions as PluginPermission[]) ?? [],
    settings: (row.settings as Record<string, unknown>) ?? {},
    lastError: row.last_error ? String(row.last_error) : null,
    installedAt: String(row.created_at),
    enabledAt: row.enabled_at ? String(row.enabled_at) : null,
  };
}

/** Plugin marketplace data access. */
export class PluginRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listCatalog(): Promise<PluginCatalogEntry[]> {
    const { data, error } = await this.client
      .from("plugin_registry")
      .select("*, plugin_versions(version, permissions, min_platform_version)")
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const versions = row.plugin_versions as Array<Record<string, unknown>> | Record<string, unknown> | null;
      const latest = Array.isArray(versions) ? versions[0] : versions;
      return catalogEntryFromRow(row, latest ?? { version: "1.0.0" });
    });
  }

  async listInstalled(companyId: string): Promise<PluginInstallation[]> {
    const { data, error } = await this.client
      .from("plugin_installations")
      .select("*, plugin_registry(plugin_id, name), plugin_versions(version)")
      .eq("company_id", companyId)
      .neq("status", "uninstalled")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const reg = row.plugin_registry as { plugin_id?: string; name?: string } | null;
      const ver = row.plugin_versions as { version?: string } | null;
      return mapInstallation(row, reg?.plugin_id ?? "", reg?.name ?? "", ver?.version ?? "1.0.0");
    });
  }

  async getVersionManifest(registryId: string, version?: string): Promise<{ versionId: string; manifest: PluginManifest; permissions: PluginPermission[] }> {
    let query = this.client.from("plugin_versions").select("*").eq("registry_id", registryId).eq("is_published", true);
    if (version) query = query.eq("version", version);
    else query = query.order("created_at", { ascending: false }).limit(1);

    const { data, error } = await query.maybeSingle();
    if (error || !data) throw new Error("Plugin version not found");

    return {
      versionId: String(data.id),
      manifest: parseManifest(data.manifest as Record<string, unknown>),
      permissions: (data.permissions as PluginPermission[]) ?? [],
    };
  }

  async install(input: {
    companyId: string;
    registryId: string;
    versionId: string;
    grantedPermissions: PluginPermission[];
    actorId?: string;
  }): Promise<PluginInstallation> {
    const { data: reg } = await this.client.from("plugin_registry").select("plugin_id, name").eq("id", input.registryId).single();
    const { data: ver } = await this.client.from("plugin_versions").select("version").eq("id", input.versionId).single();

    const { data, error } = await this.client
      .from("plugin_installations")
      .upsert(
        {
          company_id: input.companyId,
          registry_id: input.registryId,
          version_id: input.versionId,
          status: "installed",
          granted_permissions: input.grantedPermissions,
          installed_by: input.actorId ?? null,
        },
        { onConflict: "company_id,registry_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await this.audit(input.companyId, reg?.plugin_id ?? "", "plugin.installed", input.actorId, { installationId: data.id });
    return mapInstallation(data, reg?.plugin_id ?? "", reg?.name ?? "", ver?.version ?? "1.0.0");
  }

  async setStatus(companyId: string, installationId: string, status: PluginInstallation["status"], actorId?: string): Promise<void> {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "enabled") updates.enabled_at = new Date().toISOString();
    if (status === "disabled") updates.disabled_at = new Date().toISOString();

    const { data } = await this.client
      .from("plugin_installations")
      .update(updates)
      .eq("id", installationId)
      .eq("company_id", companyId)
      .select("plugin_registry(plugin_id)")
      .single();

    const reg = data?.plugin_registry as { plugin_id?: string } | null;
    await this.audit(companyId, reg?.plugin_id ?? "", `plugin.${status}`, actorId, { installationId });
  }

  async upgrade(companyId: string, installationId: string, versionId: string, actorId?: string): Promise<void> {
    const { data } = await this.client
      .from("plugin_installations")
      .update({ version_id: versionId, status: "enabled", updated_at: new Date().toISOString() })
      .eq("id", installationId)
      .eq("company_id", companyId)
      .select("plugin_registry(plugin_id)")
      .single();

    const reg = data?.plugin_registry as { plugin_id?: string } | null;
    await this.audit(companyId, reg?.plugin_id ?? "", "plugin.upgraded", actorId, { installationId, versionId });
  }

  async uninstall(companyId: string, installationId: string, actorId?: string): Promise<void> {
    const { data } = await this.client
      .from("plugin_installations")
      .update({ status: "uninstalled", disabled_at: new Date().toISOString() })
      .eq("id", installationId)
      .eq("company_id", companyId)
      .select("plugin_registry(plugin_id)")
      .single();

    const reg = data?.plugin_registry as { plugin_id?: string } | null;
    await this.audit(companyId, reg?.plugin_id ?? "", "plugin.uninstalled", actorId, { installationId });
  }

  async listHealth(companyId: string): Promise<PluginHealthRecord[]> {
    const { data, error } = await this.client
      .from("plugin_health")
      .select("*, plugin_installations(plugin_registry(plugin_id))")
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const inst = row.plugin_installations as { plugin_registry?: { plugin_id?: string } } | null;
      return {
        installationId: String(row.installation_id),
        pluginId: inst?.plugin_registry?.plugin_id ?? "",
        status: row.status as PluginHealthRecord["status"],
        executionCount: Number(row.execution_count ?? 0),
        errorCount: Number(row.error_count ?? 0),
        avgExecutionMs: Number(row.avg_execution_ms ?? 0),
        lastExecutionAt: row.last_execution_at ? String(row.last_execution_at) : null,
        lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
      };
    });
  }

  async listAudit(companyId: string, limit = 50): Promise<PluginAuditEntry[]> {
    const { data, error } = await this.client
      .from("plugin_audit_log")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      pluginId: String(row.plugin_id),
      action: String(row.action),
      createdAt: String(row.created_at),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));
  }

  async getOverview(companyId: string): Promise<MarketplaceOverview> {
    const [installed, catalog, health] = await Promise.all([
      this.client.from("plugin_installations").select("id, status", { count: "exact" }).eq("company_id", companyId).neq("status", "uninstalled"),
      this.client.from("plugin_registry").select("id", { count: "exact" }).eq("is_active", true),
      this.client.from("plugin_health").select("status, execution_count").eq("company_id", companyId),
    ]);

    const rows = installed.data ?? [];
    const enabled = rows.filter((r) => r.status === "enabled").length;
    const unhealthy = (health.data ?? []).filter((h) => h.status === "unhealthy" || h.status === "crashed").length;
    const execs = (health.data ?? []).reduce((s, h) => s + Number(h.execution_count ?? 0), 0);

    return {
      installedCount: installed.count ?? rows.length,
      enabledCount: enabled,
      availableCount: catalog.count ?? 0,
      updatesAvailable: 0,
      unhealthyCount: unhealthy,
      totalExecutions24h: execs,
    };
  }

  async audit(companyId: string, pluginId: string, action: string, actorId?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.client.from("plugin_audit_log").insert({
      company_id: companyId,
      plugin_id: pluginId,
      action,
      actor_id: actorId ?? null,
      metadata: metadata ?? {},
    });
  }
}
