import { supabase } from "@/lib/supabase";
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";
import {
  automationContextBelongsToCustomer,
  buildAutomationCustomerOrFilter,
} from "./automation-customer-scope";

const CUSTOMER_SCOPED_LIMIT = 200;

/**
 * Customer Activity source for automation executions.
 * Server-side company_id + jsonb customer UUID linkage — never company-wide latest-N.
 */
export class AutomationExecutionsTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "automation";

  async collect({ customerId, companyId }: TimelineFetchInput): Promise<TimelineActivity[]> {
    if (!companyId?.trim() || !customerId?.trim()) return [];

    const { data, error } = await supabase
      .from("automation_executions")
      .select("id, workflow_id, status, trigger_event, context, created_at, completed_at, error")
      .eq("company_id", companyId)
      .or(buildAutomationCustomerOrFilter(customerId))
      .order("created_at", { ascending: false })
      .limit(CUSTOMER_SCOPED_LIMIT);

    if (error || !data) return [];

    return data
      .filter((row) => automationContextBelongsToCustomer(row.context, customerId))
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
