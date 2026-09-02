import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createWorkflowTransferToolPorts,
  type WorkflowTransferStartWorkflow,
  type WorkflowTransferToolPorts,
} from "@workspace/ai-tool-router";
import {
  AUTOMATION_PERMISSIONS,
  createAutomationPlatformServices,
  type AutomationChannel,
  type ServiceContext as AutomationServiceContext,
} from "@workspace/automation-platform";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import { extractAutomationResponseContent } from "@workspace/channel-platform";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import { resolveFeatureEnabledViaApplicationLayer } from "./resolve-feature-flag.js";

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
 * Build AutomationEngine context for AI workflow transfer.
 * Never fabricates super-admin or feature=true.
 * Trusted company comes from LoginAppPortContext only.
 * After commercial+platform kill-switch pass, grants only automation.execute
 * (product gates: trusted company + employee tool assignment sit upstream).
 */
export async function buildWorkflowTransferServiceContext(
  client: SupabaseClient,
  portContext: LoginAppPortContext,
  inputCompanyId: string,
): Promise<AutomationServiceContext> {
  const trustedCompanyId = portContext.companyId?.trim() ?? "";
  if (!trustedCompanyId) {
    throw new Error("Workflow feature disabled");
  }
  if (inputCompanyId.trim() !== trustedCompanyId) {
    throw new Error("Company context mismatch for workflow transfer.");
  }

  if (portContext.isSuperAdmin) {
    return {
      userId: portContext.actorUserId,
      companyId: trustedCompanyId,
      isSuperAdmin: true,
      hasPermission: portContext.hasPermission,
      isWorkflowFeatureEnabled: () => true,
    };
  }

  let workflowEnabled = false;
  try {
    workflowEnabled =
      (await resolveFeatureEnabledViaApplicationLayer(
        portContext,
        PLATFORM_AI_FEATURE_KEY.AUTOMATION,
        client,
      )) === true;
  } catch {
    workflowEnabled = false;
  }
  if (workflowEnabled !== true) {
    throw new Error("Workflow feature disabled");
  }

  return {
    userId: portContext.actorUserId,
    companyId: trustedCompanyId,
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === AUTOMATION_PERMISSIONS.execute || portContext.hasPermission(code),
    isWorkflowFeatureEnabled: () => true,
  };
}

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
      const serviceCtx = await buildWorkflowTransferServiceContext(
        client,
        portContext,
        input.companyId,
      );
      const automation = createAutomationPlatformServices(client);
      const result = await automation.engine.start(serviceCtx, {
        companyId: serviceCtx.companyId!,
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
