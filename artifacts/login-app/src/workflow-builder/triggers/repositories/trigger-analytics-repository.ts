import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseAutomationRunRepository,
  type AutomationRunRecord,
} from "@workspace/automation-platform";
import type { TriggerAnalyticsModel } from "../types/trigger-types";

export class TriggerAnalyticsRepository {
  private readonly runs;

  constructor(client: SupabaseClient) {
    this.runs = createSupabaseAutomationRunRepository(client);
  }

  async loadAnalytics(companyId: string, flowId: string): Promise<TriggerAnalyticsModel> {
    const records = await this.runs.list({ companyId, flowId });
    return aggregateTriggerAnalytics(records);
  }
}

export function aggregateTriggerAnalytics(records: AutomationRunRecord[]): TriggerAnalyticsModel {
  if (records.length === 0) {
    return {
      executions: 0,
      failures: 0,
      averageLatencyMs: null,
      lastRunAt: null,
      lastRunStatus: null,
    };
  }

  const failures = records.filter((record) => record.status === "failed").length;
  const latencies = records
    .map((record) => computeRunLatencyMs(record))
    .filter((value): value is number => value !== null);
  const averageLatencyMs =
    latencies.length > 0 ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null;
  const latest = records[0];

  return {
    executions: records.length,
    failures,
    averageLatencyMs,
    lastRunAt: latest?.started_at ?? null,
    lastRunStatus: latest?.status ?? null,
  };
}

function computeRunLatencyMs(record: AutomationRunRecord): number | null {
  if (!record.finished_at) return null;
  const started = Date.parse(record.started_at);
  const finished = Date.parse(record.finished_at);
  if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) return null;
  return finished - started;
}
