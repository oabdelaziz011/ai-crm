import type { SupabaseClient } from "@supabase/supabase-js";
import { createWorkflowTransferToolPorts, type WorkflowTransferToolPorts } from "@workspace/ai-tool-router";
import {
  createSupabaseAutomationRunRepository,
  createSupabaseConversationSessionRepository,
  type AutomationPlatformServices,
  type ServiceContext as AutomationServiceContext,
} from "@workspace/automation-platform";
import { createChannelAutomationPort } from "./channel-automation-port.js";

/**
 * Elevated technical context for the automation/workflow bridge only.
 * Product authorization (tool assignment + commercial entitlement + trusted company)
 * is enforced before ToolRouter reaches this port.
 */
const SYSTEM_CONTEXT: AutomationServiceContext = {
  userId: null,
  companyId: null,
  isSuperAdmin: true,
  hasPermission: () => true,
};

export function createWebhookWorkflowTransferPorts(
  client: SupabaseClient,
  automationEngine: AutomationPlatformServices["engine"],
): WorkflowTransferToolPorts {
  const automation = createChannelAutomationPort(automationEngine, SYSTEM_CONTEXT, {
    sessions: createSupabaseConversationSessionRepository(client),
    runs: createSupabaseAutomationRunRepository(client),
  });

  return createWorkflowTransferToolPorts(client, async (input) => {
    const result = await automation.startWorkflow(input);
    return {
      runId: result.runId ?? null,
      responseContent: result.responseContent ?? null,
    };
  });
}
