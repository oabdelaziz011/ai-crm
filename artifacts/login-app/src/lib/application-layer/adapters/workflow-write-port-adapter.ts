import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowWritePort, WorkflowExecutionModel } from "@workspace/application-layer";
import { createAutomationPlatformServices, type ServiceContext } from "@workspace/automation-platform";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";
import { resolveFeatureEnabledViaApplicationLayer } from "../resolve-feature-flag.js";

type RunRow = {
  id: string;
  flow_id: string;
  status: string;
  updated_at: string;
};

function mapRunStatus(status: string): WorkflowExecutionModel["status"] {
  switch (status) {
    case "running":
    case "waiting_input":
      return "running";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return "success";
  }
}

function toExecution(run: RunRow): WorkflowExecutionModel {
  return Object.freeze({
    id: run.id,
    workflowId: run.flow_id,
    status: mapRunStatus(run.status),
    executedAt: run.updated_at,
  });
}

/**
 * Resolve platform automation kill-switch via authoritative app-layer resolver
 * (commercial entitlement AND platform_ai_feature_enabled for Platform AI keys).
 * Uses trusted LoginAppPortContext.companyId only — never request/LLM company IDs.
 */
export async function resolveWorkflowWritePortFeatureEnabled(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  if (!ctx.companyId?.trim()) return false;
  try {
    return (
      (await resolveFeatureEnabledViaApplicationLayer(
        ctx,
        PLATFORM_AI_FEATURE_KEY.AUTOMATION,
        client,
      )) === true
    );
  } catch {
    return false;
  }
}

function buildAutomationContext(
  ctx: LoginAppPortContext,
  workflowFeatureEnabled: boolean,
): ServiceContext {
  return {
    userId: ctx.actorUserId,
    companyId: ctx.companyId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
    isWorkflowFeatureEnabled: () => workflowFeatureEnabled === true,
  };
}

function canExecute(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("workflow.execute");
}

export function createLoginAppWorkflowWritePort(client: SupabaseClient, ctx: LoginAppPortContext): WorkflowWritePort {
  const automation = createAutomationPlatformServices(client);

  async function requireWorkflowRuntimeContext(): Promise<ServiceContext> {
    if (!ctx.companyId?.trim()) {
      throw new Error("Workflow feature disabled");
    }
    if (!canExecute(ctx)) {
      throw new Error("Permission denied");
    }
    const workflowEnabled = await resolveWorkflowWritePortFeatureEnabled(client, ctx);
    if (workflowEnabled !== true) {
      throw new Error("Workflow feature disabled");
    }
    return buildAutomationContext(ctx, true);
  }

  async function startExecution(
    tenantId: string,
    workflowId: string,
    payload?: Record<string, unknown>,
  ): Promise<WorkflowExecutionModel> {
    if (tenantId !== ctx.companyId) throw new Error("Permission denied");
    const serviceCtx = await requireWorkflowRuntimeContext();

    const result = await automation.engine.start(serviceCtx, {
      companyId: tenantId,
      flowId: workflowId,
      channel: "api",
      triggerSource: "manual",
      initialVariables: payload ? { ...payload } : {},
    });

    return Object.freeze({
      id: result.run.id,
      workflowId,
      status: mapRunStatus(result.lifecycle === "completed" ? "completed" : result.run.status),
      executedAt: result.run.finished_at ?? result.run.started_at,
    });
  }

  async function patchRunStatus(tenantId: string, executionId: string, status: string): Promise<WorkflowExecutionModel> {
    const { data, error } = await client
      .from("automation_runs")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("company_id", tenantId)
      .eq("id", executionId)
      .select("id, flow_id, status, updated_at")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Execution not found");
    return toExecution(data as RunRow);
  }

  return {
    execute: startExecution,
    start: startExecution,

    async pause(tenantId, executionId) {
      if (tenantId !== ctx.companyId || !canExecute(ctx)) throw new Error("Permission denied");
      return patchRunStatus(tenantId, executionId, "waiting_input");
    },

    async resume(tenantId, executionId, payload) {
      if (tenantId !== ctx.companyId) throw new Error("Permission denied");
      const serviceCtx = await requireWorkflowRuntimeContext();

      const result = await automation.engine.resume(serviceCtx, {
        runId: executionId,
        input: payload ?? {},
      });

      return Object.freeze({
        id: result.run.id,
        workflowId: result.run.flow_id,
        status: mapRunStatus(result.lifecycle === "completed" ? "completed" : result.run.status),
        executedAt: result.run.finished_at ?? result.run.started_at,
      });
    },

    async complete(tenantId, executionId) {
      if (tenantId !== ctx.companyId || !canExecute(ctx)) throw new Error("Permission denied");
      return patchRunStatus(tenantId, executionId, "completed");
    },

    async cancel(tenantId, executionId) {
      if (tenantId !== ctx.companyId) throw new Error("Permission denied");
      const serviceCtx = await requireWorkflowRuntimeContext();

      const result = await automation.engine.cancel(serviceCtx, executionId);
      return Object.freeze({
        id: result.run.id,
        workflowId: result.run.flow_id,
        status: "cancelled" as const,
        executedAt: result.run.finished_at ?? result.run.started_at,
      });
    },
  };
}
