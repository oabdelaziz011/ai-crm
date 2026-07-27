import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PlatformAiOpsAlert,
  PlatformAiOpsAuditRow,
  PlatformAiOpsAgentWorkflow,
  PlatformAiOpsCrmAgentSummary,
  PlatformAiOpsKnowledgeSummary,
  PlatformAiOpsKnowledgeDocument,
  PlatformAiOpsEmbeddingJobRow,
  PlatformAiOpsBackgroundTask,
  PlatformAiOpsCompanyCost,
  PlatformAiOpsCostTrendPoint,
  PlatformAiOpsErrorGroup,
  PlatformAiOpsFeatureRow,
  PlatformAiOpsKpis,
  PlatformAiOpsProviderHealth,
  PlatformAiOpsRequestRow,
  PlatformAiOpsToolStat,
} from "./types";

export class PlatformAiOperationsService {
  constructor(private readonly client: SupabaseClient) {}

  async getKpis(): Promise<PlatformAiOpsKpis> {
    const { data, error } = await this.client.rpc("platform_ai_ops_kpi_summary");
    if (error) throw error;
    return data as PlatformAiOpsKpis;
  }

  async getProviderHealth(providerKey = "openai"): Promise<PlatformAiOpsProviderHealth> {
    const { data, error } = await this.client.rpc("platform_ai_ops_provider_health", {
      p_provider_key: providerKey,
    });
    if (error) throw error;
    return data as PlatformAiOpsProviderHealth;
  }

  async getRequestFeed(input: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<PlatformAiOpsRequestRow[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_request_feed", {
      p_limit: input.limit ?? 50,
      p_offset: input.offset ?? 0,
      p_search: input.search?.trim() || null,
    });
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsRequestRow[];
  }

  async getToolStats(): Promise<PlatformAiOpsToolStat[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_tool_stats");
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsToolStat[];
  }

  async getBackgroundTasks(limit = 50): Promise<PlatformAiOpsBackgroundTask[]> {
    const { data, error } = await this.client
      .from("platform_ai_background_tasks")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsBackgroundTask[];
  }

  async getAgentWorkflows(limit = 20): Promise<PlatformAiOpsAgentWorkflow[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_agent_workflows", {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsAgentWorkflow[];
  }

  async getCrmAgentSummary(): Promise<PlatformAiOpsCrmAgentSummary> {
    const { data, error } = await this.client.rpc("platform_ai_ops_crm_agent_summary");
    if (error) throw error;
    return data as PlatformAiOpsCrmAgentSummary;
  }

  async getKnowledgeSummary(): Promise<PlatformAiOpsKnowledgeSummary> {
    const { data, error } = await this.client.rpc("platform_ai_ops_knowledge_summary");
    if (error) throw error;
    return data as PlatformAiOpsKnowledgeSummary;
  }

  async getKnowledgeDocuments(limit = 25): Promise<PlatformAiOpsKnowledgeDocument[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_knowledge_documents", {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsKnowledgeDocument[];
  }

  async getEmbeddingJobs(limit = 30): Promise<PlatformAiOpsEmbeddingJobRow[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_embedding_jobs", {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsEmbeddingJobRow[];
  }

  async getErrorGroups(limit = 25): Promise<PlatformAiOpsErrorGroup[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_error_groups", {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsErrorGroup[];
  }

  async getCostTrends(days = 30): Promise<PlatformAiOpsCostTrendPoint[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_cost_trends", {
      p_days: days,
    });
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsCostTrendPoint[];
  }

  async getCostByCompany(limit = 10): Promise<PlatformAiOpsCompanyCost[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_cost_by_company", {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsCompanyCost[];
  }

  async getFeatureMatrix(): Promise<PlatformAiOpsFeatureRow[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_feature_matrix");
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsFeatureRow[];
  }

  async getAdminAudit(limit = 50): Promise<PlatformAiOpsAuditRow[]> {
    const { data, error } = await this.client.rpc("platform_ai_ops_admin_audit", {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsAuditRow[];
  }

  async getRecentAlerts(limit = 10): Promise<PlatformAiOpsAlert[]> {
    const { data, error } = await this.client
      .from("platform_ai_ops_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as PlatformAiOpsAlert[];
  }

  async evaluateAlerts(): Promise<{ triggered: string[] }> {
    const { data, error } = await this.client.rpc("platform_ai_ops_evaluate_alerts");
    if (error) throw error;
    return data as { triggered: string[] };
  }
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function exportRowsToCsv<T extends Record<string, unknown>>(rows: T[], filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((key) => {
          const val = row[key];
          const str = val == null ? "" : String(val);
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportRowsToJson<T>(rows: T[], filename: string): void {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
