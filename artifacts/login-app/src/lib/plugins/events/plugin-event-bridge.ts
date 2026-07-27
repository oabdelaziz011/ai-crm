import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEventType } from "@/lib/integration/types";
import type { PluginEventType } from "@/lib/plugins/types";
import { pluginSandbox } from "@/lib/plugins/sandbox/plugin-sandbox";
import type { PluginRuntimeContext } from "@/lib/plugins/types";

/** Bridges enterprise event bus events to enabled plugins. */
export class PluginEventBridge {
  private subscribers = new Map<PluginEventType, Set<string>>();

  constructor(private readonly client: SupabaseClient) {}

  register(pluginId: string, events: PluginEventType[]): void {
    for (const event of events) {
      if (!this.subscribers.has(event)) this.subscribers.set(event, new Set());
      this.subscribers.get(event)!.add(pluginId);
    }
  }

  unregister(pluginId: string): void {
    for (const subs of this.subscribers.values()) subs.delete(pluginId);
  }

  async dispatch(companyId: string, eventType: WebhookEventType, payload: Record<string, unknown>): Promise<number> {
    const { data: enabled } = await this.client.rpc("plugin_list_enabled", { p_company_id: companyId });
    if (!enabled?.length) return 0;

    let dispatched = 0;
    const subs = this.subscribers.get(eventType as PluginEventType);

    for (const row of enabled) {
      const manifest = row.manifest as { events?: string[] } | null;
      const events = manifest?.events ?? [];
      if (!events.includes(eventType) && !subs?.has(String(row.plugin_id))) continue;

      const ctx: PluginRuntimeContext = {
        companyId,
        installationId: String(row.installation_id),
        pluginId: String(row.plugin_id),
        permissions: (row.granted_permissions as PluginRuntimeContext["permissions"]) ?? [],
        settings: (row.settings as Record<string, unknown>) ?? {},
      };

      const result = await pluginSandbox.execute(ctx, { eventType, payload });
      if (result.success) dispatched += 1;

      await this.client.from("plugin_health").upsert(
        {
          installation_id: row.installation_id,
          company_id: companyId,
          status: result.success ? "healthy" : "degraded",
          execution_count: 1,
          error_count: result.success ? 0 : 1,
          avg_execution_ms: result.executionMs,
          last_execution_at: new Date().toISOString(),
          last_error_message: result.error ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "installation_id" },
      );
    }

    return dispatched;
  }
}
