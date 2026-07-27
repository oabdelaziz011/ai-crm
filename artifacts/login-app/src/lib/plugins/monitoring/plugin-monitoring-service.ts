import type { SupabaseClient } from "@supabase/supabase-js";
import type { PluginHealthRecord } from "@/lib/plugins/types";

export type PluginMonitoringSnapshot = {
  health: PluginHealthRecord[];
  totalExecutions: number;
  totalErrors: number;
  avgExecutionMs: number;
  crashedPlugins: string[];
};

/** Plugin health and usage monitoring. */
export class PluginMonitoringService {
  constructor(private readonly client: SupabaseClient) {}

  async getSnapshot(companyId: string, healthRecords: PluginHealthRecord[]): Promise<PluginMonitoringSnapshot> {
    const totalExecutions = healthRecords.reduce((s, h) => s + h.executionCount, 0);
    const totalErrors = healthRecords.reduce((s, h) => s + h.errorCount, 0);
    const avgMs = healthRecords.length
      ? Math.round(healthRecords.reduce((s, h) => s + h.avgExecutionMs, 0) / healthRecords.length)
      : 0;

    return {
      health: healthRecords,
      totalExecutions,
      totalErrors,
      avgExecutionMs: avgMs,
      crashedPlugins: healthRecords.filter((h) => h.status === "crashed").map((h) => h.pluginId),
    };
  }
}
