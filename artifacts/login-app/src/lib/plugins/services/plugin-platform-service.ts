import type { SupabaseClient } from "@supabase/supabase-js";
import { PluginRepository } from "@/lib/plugins/repositories/plugin-repository";
import { PluginRuntimeService } from "@/lib/plugins/runtime/plugin-runtime-service";
import { PluginEventBridge } from "@/lib/plugins/events/plugin-event-bridge";
import { PluginMonitoringService } from "@/lib/plugins/monitoring/plugin-monitoring-service";
import type { PluginPermission } from "@/lib/plugins/types";

/** Main plugin platform orchestrator. */
export class PluginPlatformService {
  private readonly repo: PluginRepository;
  readonly runtime: PluginRuntimeService;
  readonly events: PluginEventBridge;
  readonly monitoring: PluginMonitoringService;

  constructor(client: SupabaseClient) {
    this.repo = new PluginRepository(client);
    this.events = new PluginEventBridge(client);
    this.runtime = new PluginRuntimeService(client, this.repo, this.events);
    this.monitoring = new PluginMonitoringService(client);
  }

  catalog = {
    list: () => this.repo.listCatalog(),
  };

  installations = {
    list: (companyId: string) => this.repo.listInstalled(companyId),
    install: (companyId: string, registryId: string, permissions: PluginPermission[], actorId?: string) =>
      this.runtime.install(companyId, registryId, permissions, actorId),
    enable: (companyId: string, id: string, actorId?: string) => this.runtime.enable(companyId, id, actorId),
    disable: (companyId: string, id: string, actorId?: string) => this.runtime.disable(companyId, id, actorId),
    upgrade: (companyId: string, id: string, actorId?: string) => this.runtime.upgrade(companyId, id, actorId),
    uninstall: (companyId: string, id: string, actorId?: string) => this.runtime.uninstall(companyId, id, actorId),
  };

  async getOverview(companyId: string) {
    return this.repo.getOverview(companyId);
  }

  async getMonitoring(companyId: string) {
    const health = await this.repo.listHealth(companyId);
    return this.monitoring.getSnapshot(companyId, health);
  }

  async getAuditLog(companyId: string) {
    return this.repo.listAudit(companyId);
  }

  async getWidgets(companyId: string) {
    const installed = await this.repo.listInstalled(companyId);
    return this.runtime.getActiveWidgets(companyId, installed);
  }
}
