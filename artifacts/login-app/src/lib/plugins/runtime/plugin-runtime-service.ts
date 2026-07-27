import type { SupabaseClient } from "@supabase/supabase-js";
import { PluginRepository } from "@/lib/plugins/repositories/plugin-repository";
import { PluginEventBridge } from "@/lib/plugins/events/plugin-event-bridge";
import { pluginSandbox } from "@/lib/plugins/sandbox/plugin-sandbox";
import { validateManifest } from "@/lib/plugins/manifest/manifest-validator";
import { validateDependencies } from "@/lib/plugins/registry/dependency-graph";
import { validatePermissionApproval } from "@/lib/plugins/permissions/permission-resolver";
import { getWidgetsForPlugin } from "@/lib/plugins/registry/plugin-registry";
import type { PluginInstallation, PluginPermission, PluginRuntimeContext, PluginWidgetContribution } from "@/lib/plugins/types";

/** Plugin lifecycle orchestrator — all plugin operations flow through here. */
export class PluginRuntimeService {
  private readonly loaded = new Map<string, PluginRuntimeContext>();

  constructor(
    private readonly client: SupabaseClient,
    private readonly repo: PluginRepository,
    private readonly events: PluginEventBridge,
  ) {}

  async install(companyId: string, registryId: string, approvedPermissions: PluginPermission[], actorId?: string): Promise<PluginInstallation> {
    const { versionId, manifest, permissions } = await this.repo.getVersionManifest(registryId);

    const validation = validateManifest(manifest);
    if (!validation.valid) throw new Error(validation.errors.join("; "));

    const permCheck = validatePermissionApproval(permissions, approvedPermissions);
    if (!permCheck.valid) throw new Error(`Unapproved permissions: ${permCheck.unapproved.join(", ")}`);

    const installed = await this.repo.listInstalled(companyId);
    const installedIds = new Set(installed.map((i) => i.pluginId));
    const depCheck = validateDependencies(manifest.pluginId, manifest.dependencies, installedIds);
    if (!depCheck.valid) throw new Error(`Missing dependencies: ${depCheck.missing.join(", ")}`);

    return this.repo.install({ companyId, registryId, versionId, grantedPermissions: approvedPermissions, actorId });
  }

  async enable(companyId: string, installationId: string, actorId?: string): Promise<void> {
    const installed = await this.repo.listInstalled(companyId);
    const entry = installed.find((i) => i.id === installationId);
    if (!entry) throw new Error("Installation not found");

    await this.repo.setStatus(companyId, installationId, "enabled", actorId);

    const { manifest } = await this.repo.getVersionManifest(entry.registryId, entry.version);
    if (manifest.events?.length) this.events.register(entry.pluginId, manifest.events);

    this.loaded.set(installationId, {
      companyId,
      installationId,
      pluginId: entry.pluginId,
      permissions: entry.grantedPermissions,
      settings: entry.settings,
    });
  }

  async disable(companyId: string, installationId: string, actorId?: string): Promise<void> {
    const installed = await this.repo.listInstalled(companyId);
    const entry = installed.find((i) => i.id === installationId);
    if (entry) this.events.unregister(entry.pluginId);
    this.loaded.delete(installationId);
    await this.repo.setStatus(companyId, installationId, "disabled", actorId);
  }

  async upgrade(companyId: string, installationId: string, actorId?: string): Promise<void> {
    const installed = await this.repo.listInstalled(companyId);
    const entry = installed.find((i) => i.id === installationId);
    if (!entry) throw new Error("Installation not found");

    const { versionId, manifest } = await this.repo.getVersionManifest(entry.registryId);
    const validation = validateManifest(manifest);
    if (!validation.valid) throw new Error(validation.errors.join("; "));

    await this.repo.upgrade(companyId, installationId, versionId, actorId);
  }

  async uninstall(companyId: string, installationId: string, actorId?: string): Promise<void> {
    await this.disable(companyId, installationId, actorId);
    await this.repo.uninstall(companyId, installationId, actorId);
  }

  async executeWidget(companyId: string, pluginId: string, input: Record<string, unknown> = {}) {
    const installed = await this.repo.listInstalled(companyId);
    const entry = installed.find((i) => i.pluginId === pluginId && i.status === "enabled");
    if (!entry) return { success: false, error: "Plugin not enabled" };

    const ctx: PluginRuntimeContext = {
      companyId,
      installationId: entry.id,
      pluginId: entry.pluginId,
      permissions: entry.grantedPermissions,
      settings: entry.settings,
    };

    return pluginSandbox.execute(ctx, input, "reports.read");
  }

  getActiveWidgets(companyId: string, installed: PluginInstallation[]): PluginWidgetContribution[] {
    const enabled = installed.filter((i) => i.status === "enabled");
    return enabled.flatMap((i) => getWidgetsForPlugin(i.pluginId));
  }

  async initialize(companyId: string): Promise<number> {
    const installed = await this.repo.listInstalled(companyId);
    let count = 0;
    for (const entry of installed.filter((i) => i.status === "enabled")) {
      try {
        await this.enable(companyId, entry.id);
        count += 1;
      } catch {
        // crash isolation — one plugin failure doesn't block others
      }
    }
    return count;
  }
}
