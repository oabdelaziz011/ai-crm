import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createWorkflowTransferToolPorts,
  type WorkflowTransferStartWorkflow,
  type WorkflowTransferToolPorts,
} from "@workspace/ai-tool-router";
import {
  createAutomationPlatformServices,
  type AutomationChannel,
  type ServiceContext as AutomationServiceContext,
} from "@workspace/automation-platform";
import { extractAutomationResponseContent } from "@workspace/channel-platform";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";

const CHANNEL_KEY_MAP: Record<string, AutomationChannel> = {
  whatsapp: "whatsapp",
  web_chat: "web_chat",
  email: "email",
  api: "api",
  messenger: "messenger",
  telegram: "telegram",
  instagram: "instagram",
  voice: "voice",
};

function mapChannelKey(channelKey: string): AutomationChannel {
  return CHANNEL_KEY_MAP[channelKey] ?? "api";
}

/**
 * Elevated technical context for the automation/workflow bridge only.
 * Matches webhook workflow-transfer bridge semantics.
 * Product authorization remains: commercial gate + allowed_tool_keys + trusted companyId.
 */
const WORKFLOW_BRIDGE_TECHNICAL_CONTEXT: AutomationServiceContext = {
  userId: null,
  companyId: null,
  isSuperAdmin: true,
  hasPermission: () => true,
  isWorkflowFeatureEnabled: () => true,
};

export type CreateApplicationLayerWorkflowTransferToolPortsDeps = {
  /** Test seam only — production always uses AutomationEngine.start. */
  startWorkflow?: WorkflowTransferStartWorkflow;
};

/**
 * Login-app Workflow Transfer ports — same shared transfer port as webhook,
 * starting via AutomationEngine (existing workflow domain boundary).
 */
export function createApplicationLayerWorkflowTransferToolPorts(
  client: SupabaseClient,
  portContext: LoginAppPortContext,
  deps?: CreateApplicationLayerWorkflowTransferToolPortsDeps,
): WorkflowTransferToolPorts {
  const startWorkflow: WorkflowTransferStartWorkflow =
    deps?.startWorkflow ??
    (async (input) => {
      const automation = createAutomationPlatformServices(client);
      const result = await automation.engine.start(WORKFLOW_BRIDGE_TECHNICAL_CONTEXT, {
        companyId: input.companyId,
        flowId: input.flowId,
        channel: mapChannelKey(input.channelKey),
        externalUserId: input.externalUserId,
        triggerSource: "inbound_message",
        initialVariables: {
          ...(input.initialVariables ?? {}),
          ...(input.metadata ?? {}),
        },
      });

      return {
        runId: result.run.id,
        responseContent: extractAutomationResponseContent(result),
      };
    });

  return createWorkflowTransferToolPorts(client, startWorkflow, {
    trustedCompanyId: portContext.companyId,
  });
}
