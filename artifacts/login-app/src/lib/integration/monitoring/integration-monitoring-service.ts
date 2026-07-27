import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationMonitoring } from "@/lib/integration/types";

/** Integration monitoring and analytics. */
export class IntegrationMonitoringService {
  constructor(private readonly client: SupabaseClient) {}

  async getMonitoring(companyId: string): Promise<IntegrationMonitoring> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [audit, deliveries] = await Promise.all([
      this.client.from("integration_api_audit_log").select("path, status_code, auth_id").eq("company_id", companyId).gte("created_at", since),
      this.client.from("integration_webhook_deliveries").select("status").eq("company_id", companyId).gte("created_at", since),
    ]);

    const pathCounts = new Map<string, number>();
    let errors = 0;
    for (const row of audit.data ?? []) {
      const path = String(row.path);
      pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
      if (Number(row.status_code) >= 400) errors += 1;
    }

    const totalCalls = audit.data?.length ?? 0;
    const delivered = (deliveries.data ?? []).filter((d) => d.status === "delivered").length;
    const totalDeliveries = deliveries.data?.length ?? 0;

    return {
      topEndpoints: [...pathCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, count]) => ({ path, count })),
      topClients: [],
      errorRate: totalCalls ? Math.round((errors / totalCalls) * 100) : 0,
      webhookSuccessRate: totalDeliveries ? Math.round((delivered / totalDeliveries) * 100) : 100,
    };
  }
}
