import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutiveAlert, AlertType, AlertSeverity } from "@/lib/executive/types";

function mapAlert(row: Record<string, unknown>): ExecutiveAlert {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    branchId: row.branch_id ? String(row.branch_id) : null,
    alertType: row.alert_type as AlertType,
    severity: row.severity as AlertSeverity,
    title: String(row.title),
    message: String(row.message),
    metricKey: row.metric_key ? String(row.metric_key) : null,
    metricValue: row.metric_value != null ? Number(row.metric_value) : null,
    thresholdValue: row.threshold_value != null ? Number(row.threshold_value) : null,
    status: row.status as ExecutiveAlert["status"],
    createdAt: String(row.created_at),
  };
}

export class ExecutiveAlertRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listActive(companyId: string, limit = 20): Promise<ExecutiveAlert[]> {
    const { data, error } = await this.client
      .from("executive_alerts")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapAlert);
  }

  async create(input: {
    companyId: string;
    branchId?: string | null;
    alertType: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    metricKey?: string;
    metricValue?: number;
    thresholdValue?: number;
  }): Promise<ExecutiveAlert> {
    const { data, error } = await this.client
      .from("executive_alerts")
      .insert({
        company_id: input.companyId,
        branch_id: input.branchId ?? null,
        alert_type: input.alertType,
        severity: input.severity,
        title: input.title,
        message: input.message,
        metric_key: input.metricKey ?? null,
        metric_value: input.metricValue ?? null,
        threshold_value: input.thresholdValue ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await this.client.from("executive_alert_audit").insert({
      company_id: input.companyId,
      alert_id: data.id,
      action: "created",
      actor_id: null,
    });

    return mapAlert(data);
  }

  async dismiss(companyId: string, alertId: string, actorId: string): Promise<void> {
    const { error } = await this.client
      .from("executive_alerts")
      .update({ status: "dismissed", dismissed_by: actorId, dismissed_at: new Date().toISOString() })
      .eq("id", alertId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);

    await this.client.from("executive_alert_audit").insert({
      company_id: companyId,
      alert_id: alertId,
      action: "dismissed",
      actor_id: actorId,
    });
  }

  async resolve(companyId: string, alertId: string, actorId: string): Promise<void> {
    const { error } = await this.client
      .from("executive_alerts")
      .update({ status: "resolved", resolved_by: actorId, resolved_at: new Date().toISOString() })
      .eq("id", alertId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);

    await this.client.from("executive_alert_audit").insert({
      company_id: companyId,
      alert_id: alertId,
      action: "resolved",
      actor_id: actorId,
    });
  }
}
