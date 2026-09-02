import type { SupabaseClient } from "@supabase/supabase-js";
import { createWorkflowTransferToolPorts, type WorkflowTransferToolPorts } from "@workspace/ai-tool-router";
import {
  AUTOMATION_PERMISSIONS,
  createSupabaseAutomationRunRepository,
  createSupabaseConversationSessionRepository,
  type AutomationPlatformServices,
  type ServiceContext as AutomationServiceContext,
} from "@workspace/automation-platform";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import { createChannelAutomationPort } from "./channel-automation-port.js";
import {
  createWebhookPlatformFeatureResolver,
  type PlatformFeatureEnabledResolver,
} from "./webhook-ai-workflow-bridge.js";

export type BuildWebhookWorkflowTransferServiceContextInput = {
  /** Company id from the transfer start payload (ToolExecutionContext / inbound). */
  companyId: string | null | undefined;
  /**
   * Optional trusted company pin (parity with login-app transfer).
   * When set, must match companyId or DENY.
   */
  trustedCompanyId?: string | null;
  resolvePlatformFeatureEnabled: PlatformFeatureEnabledResolver;
};

/**
 * Company-scoped AutomationEngine context for webhook machine automation:
 * - Part 6B: AI Employee transfer_to_workflow
 * - Part 6C: inbound channel-bound start/resume (binding / sticky / intent)
 *
 * Never fabricates isSuperAdmin / hasPermission allow-all / companyId:null.
 * Authoritative commercial∩platform automation kill-switch via createWebhookPlatformFeatureResolver
 * + narrow automation.execute after pass.
 */
export async function buildWebhookWorkflowTransferServiceContext(
  input: BuildWebhookWorkflowTransferServiceContextInput,
): Promise<AutomationServiceContext> {
  const companyId = typeof input.companyId === "string" ? input.companyId.trim() : "";
  if (!companyId) {
    throw new Error("Workflow feature disabled");
  }

  if (input.trustedCompanyId !== undefined) {
    const trusted =
      typeof input.trustedCompanyId === "string" ? input.trustedCompanyId.trim() : "";
    if (!trusted) {
      throw new Error("Workflow feature disabled");
    }
    if (companyId !== trusted) {
      throw new Error("Company context mismatch for workflow transfer.");
    }
  }

  let workflowEnabled = false;
  try {
    workflowEnabled =
      (await input.resolvePlatformFeatureEnabled(
        companyId,
        PLATFORM_AI_FEATURE_KEY.AUTOMATION,
      )) === true;
  } catch {
    workflowEnabled = false;
  }
  if (workflowEnabled !== true) {
    throw new Error("Workflow feature disabled");
  }

  return {
    userId: null,
    companyId,
    isSuperAdmin: false,
    // Machine/runtime path has no human RBAC session. After kill-switch pass, grant only
    // automation.execute (same narrow model as login-app buildWorkflowTransferServiceContext).
    hasPermission: (code) => code === AUTOMATION_PERMISSIONS.execute,
    isWorkflowFeatureEnabled: () => true,
  };
}

export type CreateWebhookWorkflowTransferPortsOptions = {
  /** Test/production seam — defaults to createWebhookPlatformFeatureResolver(client). */
  resolvePlatformFeatureEnabled?: PlatformFeatureEnabledResolver;
  /** Optional trusted company pin forwarded to shared transfer ports. */
  trustedCompanyId?: string | null;
};

export function createWebhookWorkflowTransferPorts(
  client: SupabaseClient,
  automationEngine: AutomationPlatformServices["engine"],
  options?: CreateWebhookWorkflowTransferPortsOptions,
): WorkflowTransferToolPorts {
  const resolvePlatformFeatureEnabled =
    options?.resolvePlatformFeatureEnabled ?? createWebhookPlatformFeatureResolver(client);

  const sessions = createSupabaseConversationSessionRepository(client);
  const runs = createSupabaseAutomationRunRepository(client);

  return createWorkflowTransferToolPorts(
    client,
    async (input) => {
      const serviceCtx = await buildWebhookWorkflowTransferServiceContext({
        companyId: input.companyId,
        trustedCompanyId: options?.trustedCompanyId,
        resolvePlatformFeatureEnabled,
      });

      const automation = createChannelAutomationPort(automationEngine, serviceCtx, {
        sessions,
        runs,
      });

      const result = await automation.startWorkflow({
        ...input,
        companyId: serviceCtx.companyId!,
      });
      return {
        runId: result.runId ?? null,
        responseContent: result.responseContent ?? null,
      };
    },
    options?.trustedCompanyId !== undefined
      ? { trustedCompanyId: options.trustedCompanyId }
      : undefined,
  );
}
