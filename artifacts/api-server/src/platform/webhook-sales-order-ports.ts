/**
 * Webhook host for AI sales order tools.
 * Reuses CRM customer port + follow-up cancel after purchase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseSalesOrderPorts,
  type SalesOrderToolPorts,
  type ToolCustomerServicePort,
} from "@workspace/ai-tool-router";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";

export function createWebhookSalesOrderPorts(
  client: SupabaseClient,
  customerService: ToolCustomerServicePort,
): SalesOrderToolPorts {
  return createSupabaseSalesOrderPorts(client, {
    customerService,
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
    async cancelFollowUpAfterPurchase({ companyId, leadId }) {
      const { cancelSalesFollowUpAfterLeadStop } = await import(
        "../services/sales-follow-up-schedule-on-qualify.js"
      );
      await cancelSalesFollowUpAfterLeadStop(client, {
        companyId,
        leadId,
        reason: "converted",
      });
    },
  });
}
