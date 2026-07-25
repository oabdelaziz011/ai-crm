import { supabase } from "@/lib/supabase";
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";

export class AutomationExecutionsTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "automation";

  async collect({ customerId, companyId }: TimelineFetchInput): Promise<TimelineActivity[]> {
    if (!companyId) return [];

    const { data, error } = await supabase
      .from("automation_executions")
      .select("id, workflow_id, status, trigger_event, context, created_at, completed_at, error")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !data) return [];

    return data
      .filter((row) => {
        const context = row.context as Record<string, unknown> | null;
        const params =
          context?.params != null &&
          typeof context.params === "object" &&
          !Array.isArray(context.params)
            ? (context.params as Record<string, unknown>)
            : undefined;
        const ctxCustomer =
          context?.customerId ?? context?.customer_id ?? params?.customerId;
        return String(ctxCustomer ?? "") === customerId;
      })
      .flatMap((row) => {
        const activities: TimelineActivity[] = [
          {
            id: `${this.sourceId}:started:${row.id}`,
            type: "automation_started",
            occurredAt: row.created_at,
            source: this.sourceId,
            category: "automation",
            payload: { executionId: row.id, workflowId: row.workflow_id, trigger: row.trigger_event },
            metadata: {
              workflowId: row.workflow_id,
              detail: row.trigger_event,
              searchText: [row.trigger_event, row.workflow_id, "automation"].join(" "),
              filterGroup: "automation",
            },
          },
        ];

        if (row.completed_at) {
          activities.push({
            id: `${this.sourceId}:finished:${row.id}`,
            type: "automation_finished",
            occurredAt: row.completed_at,
            source: this.sourceId,
            category: "automation",
            payload: {
              executionId: row.id,
              workflowId: row.workflow_id,
              status: row.status,
            },
            metadata: {
              workflowId: row.workflow_id,
              detail: row.error ?? row.status,
              searchText: [row.status, row.workflow_id, "automation"].join(" "),
              filterGroup: "automation",
            },
          });
        }

        return activities;
      });
  }
}
